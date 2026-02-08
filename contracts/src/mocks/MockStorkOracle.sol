// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockStorkOracle - Testing Oracle for Development
/// @notice Mock implementation of Stork Oracle for POC testing
/// @dev DO NOT USE IN PRODUCTION - this is for testing only
///      Owner can set prices manually for demo purposes

contract MockStorkOracle {
    address public owner;
    
    struct PriceData {
        int192 value;      // 18 decimals
        uint64 timestamp;
        bool exists;
    }
    
    mapping(bytes32 => PriceData) public prices;
    
    event PriceUpdated(bytes32 indexed id, int192 value, uint64 timestamp);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        
        // Set default EUR/USD price: 1.08 with 18 decimals
        bytes32 eurusd = bytes32("EURUSD");
        prices[eurusd] = PriceData({
            value: 1080000000000000000, // 1.08 * 1e18
            timestamp: uint64(block.timestamp),
            exists: true
        });
        
        emit PriceUpdated(eurusd, 1080000000000000000, uint64(block.timestamp));
    }
    
    /// @notice Set price for a feed (owner only)
    /// @param id Feed identifier
    /// @param value Price value (18 decimals)
    function setPrice(bytes32 id, int192 value) external onlyOwner {
        require(value > 0, "invalid price");
        
        prices[id] = PriceData({
            value: value,
            timestamp: uint64(block.timestamp),
            exists: true
        });
        
        emit PriceUpdated(id, value, uint64(block.timestamp));
    }
    
    /// @notice Stork Oracle interface implementation
    function getTemporalNumericValueV1(bytes32 id)
        external
        view
        returns (
            bytes32,
            int192,
            uint64,
            bytes32,
            bytes memory
        )
    {
        PriceData memory data = prices[id];
        require(data.exists, "feed not found");
        
        return (
            id,
            data.value,
            data.timestamp,
            bytes32(0), // qualifiers
            ""          // encodedAsset
        );
    }
    
    /// @notice Check if feed exists
    function isFeedAvailable(bytes32 id) external view returns (bool) {
        return prices[id].exists;
    }
    
    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }
}
