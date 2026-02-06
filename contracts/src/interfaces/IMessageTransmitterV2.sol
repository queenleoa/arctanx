// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMessageTransmitterV2 - Circle CCTP V2 generic message passing
/// @notice Sends and receives all cross-chain messages
interface IMessageTransmitterV2 {
    /// @notice Receives a message on destination chain
    /// @param message Encoded message bytes
    /// @param attestation Signed attestation from Circle
    /// @return success Whether the message was received successfully
    function receiveMessage(
        bytes calldata message,
        bytes calldata attestation
    ) external returns (bool success);

    /// @notice Sends a generic message to destination domain
    /// @param destinationDomain Destination domain ID
    /// @param recipient Recipient address on destination (bytes32)
    /// @param destinationCaller Authorized caller on destination
    /// @param minFinalityThreshold Minimum finality threshold
    /// @param messageBody Application-specific message body
    /// @return nonce Unique message identifier
    function sendMessage(
        uint32 destinationDomain,
        bytes32 recipient,
        bytes32 destinationCaller,
        uint32 minFinalityThreshold,
        bytes calldata messageBody
    ) external returns (uint64 nonce);
}
