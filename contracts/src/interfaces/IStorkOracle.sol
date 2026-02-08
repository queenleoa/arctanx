// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStorkOracle - Stork Network Oracle Interface
/// @notice Interface for fetching real-time price data from Stork
/// @dev Stork provides timestamped price feeds with 18-decimal precision
///      Docs: https://docs.stork.network/
interface IStorkOracle {
    /// @notice Get the latest price for a feed
    /// @param feedId Feed identifier (e.g., bytes32("EURUSD"))
    /// @return Feed identifier
    /// @return value Price value (18 decimals, signed int192)
    /// @return timestamp Unix timestamp of the price update
    /// @return qualifiers Additional feed qualifiers
    /// @return encodedAsset Encoded asset information
    function getTemporalNumericValueV1(bytes32 feedId)
        external
        view
        returns (
            bytes32,
            int192 value,
            uint64 timestamp,
            bytes32 qualifiers,
            bytes memory encodedAsset
        );

    /// @notice Get price for a feed at a specific time
    /// @param feedId Feed identifier
    /// @param timestamp Specific timestamp to query
    function getTemporalNumericValueAtTimeV1(bytes32 feedId, uint64 timestamp)
        external
        view
        returns (
            bytes32,
            int192,
            uint64,
            bytes32,
            bytes memory
        );

    /// @notice Check if a feed is available
    /// @param feedId Feed identifier
    /// @return available Whether the feed exists and is active
    function isFeedAvailable(bytes32 feedId) external view returns (bool available);
}