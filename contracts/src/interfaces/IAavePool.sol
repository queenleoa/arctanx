// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAavePool - Minimal Aave V3 Pool interface for supply/withdraw
interface IAavePool {
    /// @notice Supplies an amount of asset into the pool, receiving aTokens
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /// @notice Withdraws an amount of asset from the pool, burning aTokens
    /// @return The final amount withdrawn
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);

    /// @notice Returns the user account data across all reserves
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );

    /// @notice Returns the list of initialized reserve addresses
    function getReservesList() external view returns (address[] memory);
}
