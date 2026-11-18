// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TEST ONLY — mock SPACE ID Agent ID registry for local Ganache tests.
/// @dev Only implements the two views DeepMint uses. The test script registers
///      (handle, owner) pairs; ownerOf derives the tokenId itself from the
///      handle, exactly like the real registry's tokenId scheme.
contract MockRegistry {
    mapping(address => string) private _handles;
    mapping(uint256 => address) private _owners;

    /// @notice Registers `handle` for `owner` (tokenId = keccak256(handle)).
    function setAgentId(string calldata handle, address owner) external {
        _handles[owner] = handle;
        _owners[uint256(keccak256(bytes(handle)))] = owner;
    }

    function handleOf(address account) external view returns (string memory) {
        return _handles[account];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }
}

/// @notice TEST ONLY — mock Chainlink BNB/USD feed for local Ganache tests.
/// @dev Returns a fixed, settable answer + updatedAt via latestRoundData.
contract MockFeed {
    int256 private _answer;
    uint256 private _updatedAt;

    constructor(int256 answer, uint256 updatedAt) {
        _answer = answer;
        _updatedAt = updatedAt;
    }

    /// @notice Sets the feed answer (8 decimals, e.g. $588.89 -> 58889000000).
    function setAnswer(int256 answer) external {
        _answer = answer;
    }

    /// @notice Sets the feed updatedAt timestamp.
    function setUpdatedAt(uint256 updatedAt) external {
        _updatedAt = updatedAt;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (1, _answer, _updatedAt, _updatedAt, 1);
    }
}

/// @notice TEST ONLY — mock DEEP token for local Ganache tests.
/// @dev Plain OpenZeppelin ERC-20, minted to the deployer in the constructor.
contract MockDEEP is ERC20 {
    constructor(uint256 supply) ERC20("DEEP BNB", "DEEP") {
        _mint(msg.sender, supply);
    }
}
