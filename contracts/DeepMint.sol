// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal interface of the SPACE ID Agent ID registry on BNB Chain.
/// @dev Same two views DeepBNB uses (see DeepBNB.sol):
///      - handleOf(account) returns the Agent ID handle (e.g. "viss") bound to
///        the account, or an empty string if the account has no Agent ID.
///      - ownerOf(tokenId) is the standard ERC-721 owner lookup, where the
///        Agent ID tokenId is uint256(keccak256(bytes(handle))).
interface ISpaceIdRegistry {
    function handleOf(address account) external view returns (string memory);

    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice Minimal interface of a Chainlink AggregatorV3 price feed.
/// @dev Only latestRoundData is needed. The BNB/USD feed on BNB Chain
///      returns the price with 8 decimals (e.g. $588.89 -> 58889000000).
interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title DeepMint — Agent ID-gated DEEP mint (paid $1 + free claim)
/// @notice Mint contract for the DEEP BNB project on BNB Chain (chainId 56).
///         Sells DEEP at a fixed $1 USD price (BNB amount read live from the
///         Chainlink BNB/USD feed) and gives one free claim per Agent ID.
///         Every mint is gated on-chain by SPACE ID Agent ID ownership.
/// @dev HOW IT WORKS
///      The project wallet funds this contract with DEEP up front (a plain
///      ERC-20 transfer). Mints then pay DEEP out of this contract's balance.
///      Maximum DEEP this contract can ever distribute is bounded by the
///      mint cap: 10,000 mints x 10,000 DEEP = 100,000,000 DEEP if every
///      mint is paid (50,000,000 if every mint is free).
///
///      Two mint paths, both tracked PER AGENT ID tokenId (not per wallet):
///        mintPaid() — payable, $1 in BNB -> 10,000 DEEP. Max 10 paid
///                     mints per Agent ID. Overpayment is refunded.
///        mintFree() — 5,000 DEEP, once per Agent ID. This is IN ADDITION
///                     to the 1,000 DEEP airdrop in the token contract
///                     (the token contract is immutable and untouched).
///      One shared counter (totalMints) caps paid + free mints at 10,000.
///      After 10,000, every mint reverts.
///
///      PRICE MATH (Chainlink BNB/USD feed, 8 decimals):
///        priceWei = (1e8 * 1e18) / feedAnswer
///        $1 is 1e8 feed units; 1 BNB is 1e18 wei; the feed answer is
///        "USD per BNB" in 1e8 units. Example: feed $588.89
///        (answer 58889000000) -> priceWei = 10^26 / 58889000000
///        = 1,698,110,003,566,031 wei (~0.00169811 BNB). Integer division
///        truncates in the minter's favour by less than 1 wei — negligible.
///      The price is re-read from the feed on EVERY mint, so the BNB amount
///      always tracks the live $1 price. A stale (older than 1 hour) or
///      non-positive feed answer reverts the mint instead of minting at a
///      wrong price.
///
///      DESIGN DECISION — no withdraw / no owner: like DeepBNB, this
///      contract has NO owner and NO withdraw function. The exact priceWei
///      of every paid mint is forwarded DIRECTLY to the project wallet
///      (RECIPIENT) inside the mint transaction itself, and any overpayment
///      is refunded to the minter in the same transaction. BNB therefore
///      never accumulates here — there is nothing to withdraw, and nobody
///      (not even the deployer) can ever move funds out of this contract
///      except through the mint paths above. There is also deliberately NO
///      receive/fallback function: BNB sent directly to this contract
///      reverts instead of getting stuck with no way out.
///
///      Agent ID verification (see hasAgentId, same pattern as DeepBNB):
///        1. Read the caller's handle from the SPACE ID registry.
///        2. Derive the Agent ID tokenId: uint256(keccak256(bytes(handle))).
///        3. Confirm the registry reports the caller as the owner of that
///           tokenId. Only then is the caller a verified Agent ID holder.
///      Tracking is per Agent ID tokenId: if an Agent ID is transferred to
///      a new wallet, the new owner inherits the used quota (no double
///      free claim, no fresh 10 paid mints).
///
///      SECURITY: checks-effects-interactions throughout — counters are
///      updated BEFORE any token transfer or BNB send — plus OpenZeppelin
///      ReentrancyGuard on both mint functions (mintPaid moves tokens AND
///      BNB to two different recipients, so the guard is belt-and-braces
///      on top of the ordering). All external calls (token transfer, BNB
///      forward, refund) are checked and revert the whole mint on failure.
contract DeepMint is ReentrancyGuard {
    /// @notice DEEP token on BNB Chain (immutable).
    IERC20 public constant DEEP = IERC20(0x8faA6CA42A3B56297e1c96144352327bbBf75FC6);

    /// @notice SPACE ID Agent ID registry on BNB Chain (immutable).
    ISpaceIdRegistry public constant AGENT_ID_REGISTRY =
        ISpaceIdRegistry(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F);

    /// @notice Chainlink BNB/USD price feed on BNB Chain (immutable, 8 decimals).
    IAggregatorV3 public constant PRICE_FEED = IAggregatorV3(0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE);

    /// @notice Project wallet receiving the BNB from every paid mint (immutable, set in constructor).
    address public immutable RECIPIENT;

    /// @notice DEEP per paid mint: 10,000 DEEP.
    uint256 public constant PAID_AMOUNT = 10_000 * 10 ** 18;

    /// @notice DEEP per free claim: 5,000 DEEP.
    uint256 public constant FREE_AMOUNT = 5_000 * 10 ** 18;

    /// @notice Price of one paid mint in USD, in feed units (8 decimals): $1 = 1e8.
    uint256 public constant USD_PRICE = 1e8;

    /// @notice Max paid mints per Agent ID.
    uint256 public constant MAX_PAID_PER_AGENT = 10;

    /// @notice Max total mints (paid + free combined).
    uint256 public constant MAX_MINTS = 10_000;

    /// @notice Max age of a Chainlink answer before it counts as stale: 1 hour.
    uint256 public constant MAX_FEED_AGE = 3600;

    /// @notice Total mints so far (paid + free combined).
    uint256 public totalMints;

    /// @notice agentId tokenId => number of paid mints used (max MAX_PAID_PER_AGENT).
    mapping(uint256 => uint256) public paidMintsByAgentId;

    /// @notice agentId tokenId => true once its free 5,000 DEEP has been claimed.
    mapping(uint256 => bool) public freeClaimedByAgentId;

    /// @notice Emitted on every paid mint.
    event PaidMint(address indexed minter, uint256 indexed agentId, uint256 amount, uint256 priceWei);

    /// @notice Emitted on every free claim.
    event FreeMint(address indexed minter, uint256 indexed agentId, uint256 amount);

    /// @notice Deploys DeepMint; the recipient is the project wallet that
    ///         receives the BNB from every paid mint.
    /// @dev The recipient is a constructor parameter (not msg.sender) so the
    ///      contract can be deployed via a deterministic CREATE2 factory
    ///      while the BNB still lands in the project wallet.
    /// @param recipient Project wallet receiving paid-mint BNB. Must be non-zero.
    constructor(address recipient) {
        require(recipient != address(0), "DeepMint: zero recipient");
        RECIPIENT = recipient;
    }

    /// @notice Derives the Agent ID tokenId for a handle.
    /// @dev tokenId = uint256(keccak256(bytes(handle))).
    function agentIdOf(string memory handle) public pure returns (uint256) {
        return uint256(keccak256(bytes(handle)));
    }

    /// @notice Returns true if `account` verifiably owns an Agent ID.
    /// @dev Same pattern as DeepBNB.hasAgentId: reads the handle from the
    ///      registry, derives its tokenId, and checks the registry reports
    ///      `account` as that token's owner. Returns false (never reverts)
    ///      when the registry is not deployed on this chain, when the
    ///      account has no handle, when the token does not exist, or when
    ///      a registry call fails.
    function hasAgentId(address account) public view returns (bool) {
        if (address(AGENT_ID_REGISTRY).code.length == 0) {
            return false;
        }
        string memory handle;
        try AGENT_ID_REGISTRY.handleOf(account) returns (string memory h) {
            handle = h;
        } catch {
            return false;
        }
        if (bytes(handle).length == 0) {
            return false;
        }
        uint256 tokenId = agentIdOf(handle);
        try AGENT_ID_REGISTRY.ownerOf(tokenId) returns (address owner) {
            return owner == account;
        } catch {
            return false;
        }
    }

    /// @notice Current price of one paid mint ($1) in wei, from the Chainlink feed.
    /// @dev Reverts when the feed is missing, the answer is non-positive, or
    ///      the answer is older than MAX_FEED_AGE (1 hour). Formula:
    ///      priceWei = (USD_PRICE * 1e18) / feedAnswer.
    function priceWei() public view returns (uint256) {
        if (address(PRICE_FEED).code.length == 0) {
            revert("DeepMint: no feed");
        }
        (, int256 answer, , uint256 updatedAt, ) = PRICE_FEED.latestRoundData();
        require(answer > 0, "DeepMint: bad price");
        require(updatedAt != 0 && updatedAt <= block.timestamp, "DeepMint: bad feed time");
        require(block.timestamp - updatedAt <= MAX_FEED_AGE, "DeepMint: stale price");
        return (USD_PRICE * 1e18) / uint256(answer);
    }

    /// @notice Paid mints still available for an Agent ID (0..MAX_PAID_PER_AGENT).
    function paidMintsRemaining(uint256 agentId) public view returns (uint256) {
        uint256 used = paidMintsByAgentId[agentId];
        return used >= MAX_PAID_PER_AGENT ? 0 : MAX_PAID_PER_AGENT - used;
    }

    /// @notice Amount `account` can currently claim for free: FREE_AMOUNT if
    ///         the account holds an unclaimed Agent ID and the cap is not
    ///         reached, otherwise 0.
    function freeClaimable(address account) public view returns (uint256) {
        if (!hasAgentId(account) || totalMints >= MAX_MINTS) {
            return 0;
        }
        string memory handle = AGENT_ID_REGISTRY.handleOf(account);
        if (freeClaimedByAgentId[agentIdOf(handle)]) {
            return 0;
        }
        return FREE_AMOUNT;
    }

    /// @notice Mints left before the cap (paid + free combined).
    function remainingMints() public view returns (uint256) {
        return totalMints >= MAX_MINTS ? 0 : MAX_MINTS - totalMints;
    }

    /// @notice DEEP balance held by this contract (the mint inventory).
    /// @dev Returns 0 when the token has no code on this chain (same
    ///      extcodesize guard as hasAgentId), so mint functions revert with
    ///      "DEEP depleted" instead of a bare revert on a chain without DEEP.
    function deepBalance() public view returns (uint256) {
        if (address(DEEP).code.length == 0) {
            return 0;
        }
        return DEEP.balanceOf(address(this));
    }

    /// @notice Internal Agent ID check shared by both mint paths: reverts
    ///         unless the caller owns an Agent ID, and returns its tokenId.
    function _agentIdOfSender() internal view returns (uint256) {
        require(hasAgentId(msg.sender), "DeepMint: no Agent ID");
        string memory handle = AGENT_ID_REGISTRY.handleOf(msg.sender);
        return agentIdOf(handle);
    }

    /// @notice Paid mint: pay $1 in BNB (live Chainlink price) for 10,000 DEEP.
    /// @dev Checks-effects-interactions: quota + cap counters are updated
    ///      BEFORE the token transfer, the BNB forward to RECIPIENT, and
    ///      the overpayment refund. ReentrancyGuard is belt-and-braces.
    ///      Requires msg.value >= priceWei(); any excess is refunded.
    function mintPaid() external payable nonReentrant {
        uint256 agentId = _agentIdOfSender();
        require(totalMints < MAX_MINTS, "DeepMint: cap reached");
        require(paidMintsByAgentId[agentId] < MAX_PAID_PER_AGENT, "DeepMint: paid limit reached");
        uint256 price = priceWei();
        require(msg.value >= price, "DeepMint: insufficient BNB");
        require(deepBalance() >= PAID_AMOUNT, "DeepMint: DEEP depleted");

        // Effects before interactions.
        paidMintsByAgentId[agentId] += 1;
        totalMints += 1;

        emit PaidMint(msg.sender, agentId, PAID_AMOUNT, price);

        // Interactions: token out, exact price to the project wallet, refund of any excess.
        require(DEEP.transfer(msg.sender, PAID_AMOUNT), "DeepMint: DEEP transfer failed");
        (bool sent, ) = RECIPIENT.call{value: price}("");
        require(sent, "DeepMint: BNB forward failed");
        uint256 refund = msg.value - price;
        if (refund > 0) {
            (bool refunded, ) = msg.sender.call{value: refund}("");
            require(refunded, "DeepMint: refund failed");
        }
    }

    /// @notice Free claim: 5,000 DEEP, once per Agent ID.
    /// @dev Checks-effects-interactions: the claim is marked BEFORE the
    ///      transfer, so no reentrancy can double-claim.
    function mintFree() external nonReentrant {
        uint256 agentId = _agentIdOfSender();
        require(totalMints < MAX_MINTS, "DeepMint: cap reached");
        require(!freeClaimedByAgentId[agentId], "DeepMint: already claimed");
        require(deepBalance() >= FREE_AMOUNT, "DeepMint: DEEP depleted");

        // Effects before interactions.
        freeClaimedByAgentId[agentId] = true;
        totalMints += 1;

        emit FreeMint(msg.sender, agentId, FREE_AMOUNT);
        require(DEEP.transfer(msg.sender, FREE_AMOUNT), "DeepMint: DEEP transfer failed");
    }
}
