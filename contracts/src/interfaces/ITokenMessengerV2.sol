// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITokenMessengerV2 - Circle CCTP V2 TokenMessenger interface
/// @notice Entrypoint for cross-chain USDC transfers via burn-and-mint
interface ITokenMessengerV2 {
    /// @notice Deposits and burns tokens to be minted on destination domain
    /// @param amount Amount of tokens to deposit and burn
    /// @param destinationDomain Destination domain ID
    /// @param mintRecipient Address of mint recipient on destination (bytes32)
    /// @param burnToken Address of token to burn on local domain
    /// @param destinationCaller Authorized caller on destination (bytes32(0) = anyone)
    /// @param maxFee Maximum fee for transfer in burnToken units
    /// @param minFinalityThreshold Minimum finality: 1000=Fast, 2000=Standard
    /// @return nonce Unique identifier for the message
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external returns (uint64 nonce);

    /// @notice Same as depositForBurn but with additional hookData for custom logic
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external returns (uint64 nonce);

    /// @notice Returns minimum fee for a given amount (Standard Transfer)
    function getMinFeeAmount(uint256 amount) external view returns (uint256);
}
