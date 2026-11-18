// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice TEST ONLY — NEVER DEPLOY TO MAINNET.
/// @dev DeepMintTest is a line-for-line copy of DeepMint.sol's logic with two
///      differences, both existing ONLY so the logic can be unit-tested on a
///      local empty Ganache chain (which has no SPACE ID registry, no
///      Chainlink feed, and no DEEP token):
///        1. The token / registry / feed addresses are immutable constructor
///           parameters instead of hardcoded mainnet constants, so mock
///           contracts can be injected.
///        2. MAX_MINTS is a constructor parameter instead of the constant
///           10,000, so the cap test can run in seconds (a real 10,000-mint
///           run would need 10,000 transactions and 10,000 distinct Agent
///           IDs for the free path).
///      Everything else — Agent ID verification, price math, stale-price
///      protection, per-Agent-ID quotas, checks-effects-interactions,
///      ReentrancyGuard, refund/forward flow, revert strings — is IDENTICAL
///      to DeepMint.sol. Any change to DeepMint.sol MUST be mirrored here.
///      The production contract is verified separately on a BSC fork
///      (test-fork-mint.js, by another agent) against the REAL registry,
///      feed, and token.
interface ISpaceIdRegistryTest {
    function handleOf(address account) external view returns (string memory);

    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IAggregatorV3Test {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title DeepMintTest — test-only DeepMint with injectable addresses
contract DeepMintTest is ReentrancyGuard {
    /// @notice Test-only: DEEP token address, injected via constructor.
    IERC20 public immutable DEEP;

    /// @notice Test-only: SPACE ID registry address, injected via constructor.
    ISpaceIdRegistryTest public immutable AGENT_ID_REGISTRY;

    /// @notice Test-only: Chainlink feed address, injected via constructor.
    IAggregatorV3Test public immutable PRICE_FEED;

    /// @notice Project wallet receiving the BNB from every paid mint.
    address public immutable RECIPIENT;

    /// @notice DEEP per paid mint: 10,000 DEEP.
    uint256 public constant PAID_AMOUNT = 10_000 * 10 ** 18;

    /// @notice DEEP per free claim: 5,000 DEEP.
    uint256 public constant FREE_AMOUNT = 5_000 * 10 ** 18;

    /// @notice Price of one paid mint in USD, in feed units (8 decimals): $1 = 1e8.
    uint256 public constant USD_PRICE = 1e8;

    /// @notice Max paid mints per Agent ID.
    uint256 public constant MAX_PAID_PER_AGENT = 10;

    /// @notice Test-only: max total mints, injected via constructor
    ///         (production value is 10,000).
    uint256 public immutable MAX_MINTS;

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

    constructor(address token, address registry, address feed, address recipient, uint256 maxMints) {
        require(token != address(0), "DeepMint: zero token");
        require(registry != address(0), "DeepMint: zero registry");
        require(feed != address(0), "DeepMint: zero feed");
        require(recipient != address(0), "DeepMint: zero recipient");
        DEEP = IERC20(token);
        AGENT_ID_REGISTRY = ISpaceIdRegistryTest(registry);
        PRICE_FEED = IAggregatorV3Test(feed);
        RECIPIENT = recipient;
        MAX_MINTS = maxMints;
    }

    function agentIdOf(string memory handle) public pure returns (uint256) {
        return uint256(keccak256(bytes(handle)));
    }

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

    function paidMintsRemaining(uint256 agentId) public view returns (uint256) {
        uint256 used = paidMintsByAgentId[agentId];
        return used >= MAX_PAID_PER_AGENT ? 0 : MAX_PAID_PER_AGENT - used;
    }

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

    function remainingMints() public view returns (uint256) {
        return totalMints >= MAX_MINTS ? 0 : MAX_MINTS - totalMints;
    }

    function deepBalance() public view returns (uint256) {
        if (address(DEEP).code.length == 0) {
            return 0;
        }
        return DEEP.balanceOf(address(this));
    }

    function _agentIdOfSender() internal view returns (uint256) {
        require(hasAgentId(msg.sender), "DeepMint: no Agent ID");
        string memory handle = AGENT_ID_REGISTRY.handleOf(msg.sender);
        return agentIdOf(handle);
    }

    function mintPaid() external payable nonReentrant {
        uint256 agentId = _agentIdOfSender();
        require(totalMints < MAX_MINTS, "DeepMint: cap reached");
        require(paidMintsByAgentId[agentId] < MAX_PAID_PER_AGENT, "DeepMint: paid limit reached");
        uint256 price = priceWei();
        require(msg.value >= price, "DeepMint: insufficient BNB");
        require(deepBalance() >= PAID_AMOUNT, "DeepMint: DEEP depleted");

        paidMintsByAgentId[agentId] += 1;
        totalMints += 1;

        emit PaidMint(msg.sender, agentId, PAID_AMOUNT, price);

        require(DEEP.transfer(msg.sender, PAID_AMOUNT), "DeepMint: DEEP transfer failed");
        (bool sent, ) = RECIPIENT.call{value: price}("");
        require(sent, "DeepMint: BNB forward failed");
        uint256 refund = msg.value - price;
        if (refund > 0) {
            (bool refunded, ) = msg.sender.call{value: refund}("");
            require(refunded, "DeepMint: refund failed");
        }
    }

    function mintFree() external nonReentrant {
        uint256 agentId = _agentIdOfSender();
        require(totalMints < MAX_MINTS, "DeepMint: cap reached");
        require(!freeClaimedByAgentId[agentId], "DeepMint: already claimed");
        require(deepBalance() >= FREE_AMOUNT, "DeepMint: DEEP depleted");

        freeClaimedByAgentId[agentId] = true;
        totalMints += 1;

        emit FreeMint(msg.sender, agentId, FREE_AMOUNT);
        require(DEEP.transfer(msg.sender, FREE_AMOUNT), "DeepMint: DEEP transfer failed");
    }
}
