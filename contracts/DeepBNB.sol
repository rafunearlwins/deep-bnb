// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal interface of the SPACE ID Agent ID registry on BNB Chain.
/// @dev Only the two views needed for Agent ID verification:
///      - handleOf(account) returns the Agent ID handle (e.g. "viss") bound to
///        the account, or an empty string if the account has no Agent ID.
///      - ownerOf(tokenId) is the standard ERC-721 owner lookup, where the
///        Agent ID tokenId is uint256(keccak256(bytes(handle))).
interface ISpaceIdRegistry {
    function handleOf(address account) external view returns (string memory);

    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title DEEP BNB (DEEP)
/// @notice ERC-20 token for the DEEP BNB project on BNB Chain (chainId 56),
///         with an on-chain Agent ID airdrop.
/// @dev Fixed supply, no minting/burning/pausing after deployment. No
///      owner-only functions exist, so no Ownable (keeps the contract
///      minimal and trustless — nothing can be changed post-deploy).
///
///      Supply split at deploy (fixed, enforced by the constructor):
///        300,000,000 DEEP (30%) -> minted to THIS contract as the Agent ID
///                                airdrop pool; claimable 1,000 DEEP per
///                                Agent ID via claimAirdrop().
///        700,000,000 DEEP (70%) -> minted to the initial holder named in
///                                the constructor (the project wallet) for
///                                the remaining planned distribution
///                                (executed off-chain / manually after
///                                deployment):
///                                  20% liquidity (locked)
///                                  20% ecosystem grants
///                                  15% team vesting
///                                  10% treasury
///                                   5% hackathon / marketing
///
///      Agent ID verification (see hasAgentId):
///        1. Read the caller's handle from the SPACE ID registry.
///        2. Derive the Agent ID tokenId: uint256(keccak256(bytes(handle))).
///        3. Confirm the registry reports the caller as the owner of that
///           tokenId. Only then is the caller a verified Agent ID holder.
///      One claim per Agent ID tokenId (not per wallet): if an Agent ID is
///      transferred to a new wallet, the new owner cannot claim again.
///
///      DESIGN DECISION — no rescue/withdraw: there is deliberately NO
///      function that can move tokens out of the airdrop pool except
///      claimAirdrop(). Unclaimed airdrop tokens stay in the contract
///      forever; nobody (not even the deployer) can withdraw them. This
///      guarantees the 30% allocation can only ever reach Agent ID holders.
contract DeepBNB is ERC20 {
    /// @notice SPACE ID Agent ID registry on BNB Chain (immutable).
    ISpaceIdRegistry public constant AGENT_ID_REGISTRY =
        ISpaceIdRegistry(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F);

    /// @notice Fixed total supply: 1,000,000,000 DEEP (1e9 tokens, 18 decimals).
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @notice Airdrop pool: 300,000,000 DEEP (30% of supply), held by this contract.
    uint256 public constant AIRDROP_POOL = 300_000_000 * 10 ** 18;

    /// @notice Amount claimable per Agent ID: 1,000 DEEP.
    uint256 public constant CLAIM_AMOUNT = 1_000 * 10 ** 18;

    /// @notice agentId tokenId => true once its 1,000 DEEP has been claimed.
    mapping(uint256 => bool) public claimedByAgentId;

    /// @notice Emitted when an Agent ID holder claims the airdrop.
    event AirdropClaimed(address indexed claimer, uint256 indexed agentId, uint256 amount);

    /// @notice Mints 30% of supply to this contract (airdrop pool) and 70% to the initial holder.
    /// @dev The initial holder is a constructor parameter (not msg.sender) so
    ///      the contract can be deployed via a deterministic CREATE2 factory
    ///      while the deployer allocation still lands in the project wallet.
    /// @param initialHolder Receives the 700,000,000 DEEP deployer allocation.
    constructor(address initialHolder) ERC20("DEEP BNB", "DEEP") {
        require(initialHolder != address(0), "DEEP: zero holder");
        _mint(address(this), AIRDROP_POOL);
        _mint(initialHolder, TOTAL_SUPPLY - AIRDROP_POOL);
    }

    /// @notice Derives the Agent ID tokenId for a handle.
    /// @dev tokenId = uint256(keccak256(bytes(handle))).
    function agentIdOf(string memory handle) public pure returns (uint256) {
        return uint256(keccak256(bytes(handle)));
    }

    /// @notice Returns true if `account` verifiably owns an Agent ID.
    /// @dev Reads the handle from the registry, derives its tokenId, and
    ///      checks the registry reports `account` as that token's owner.
    ///      Returns false (never reverts) when the registry is not deployed
    ///      on this chain, when the account has no handle, when the token
    ///      does not exist, or when a registry call fails.
    ///      NOTE: the explicit code-length check is required — the
    ///      compiler's extcodesize check on a high-level external call
    ///      reverts OUTSIDE try/catch when the target has no code, so
    ///      try/catch alone cannot guard a missing registry.
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

    /// @notice Amount `account` can currently claim: CLAIM_AMOUNT if the
    ///         account holds an unclaimed Agent ID, otherwise 0.
    function claimable(address account) public view returns (uint256) {
        if (!hasAgentId(account)) {
            return 0;
        }
        string memory handle = AGENT_ID_REGISTRY.handleOf(account);
        if (claimedByAgentId[agentIdOf(handle)]) {
            return 0;
        }
        return CLAIM_AMOUNT;
    }

    /// @notice DEEP remaining in the airdrop pool (this contract's balance).
    function remainingAirdrop() public view returns (uint256) {
        return balanceOf(address(this));
    }

    /// @notice Claims 1,000 DEEP for the caller's Agent ID (one claim per Agent ID).
    /// @dev Checks-effects-interactions: the claim is marked BEFORE the
    ///      transfer, so no reentrancy can double-claim.
    function claimAirdrop() external {
        require(hasAgentId(msg.sender), "DEEP: no Agent ID");
        string memory handle = AGENT_ID_REGISTRY.handleOf(msg.sender);
        uint256 tokenId = agentIdOf(handle);
        require(!claimedByAgentId[tokenId], "DEEP: already claimed");
        require(balanceOf(address(this)) >= CLAIM_AMOUNT, "DEEP: airdrop depleted");

        // Effect before interaction.
        claimedByAgentId[tokenId] = true;

        emit AirdropClaimed(msg.sender, tokenId, CLAIM_AMOUNT);
        _transfer(address(this), msg.sender, CLAIM_AMOUNT);
    }
}
