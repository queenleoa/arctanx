// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAaveV3Pool - Aave V3 Pool Interface
/// @notice Core lending pool interface for Aave V3
/// @dev Docs: https://docs.aave.com/developers/core-contracts/pool
interface IAaveV3Pool {
    /// @notice Supplies an amount of underlying asset to the reserve
    /// @param asset The address of the underlying asset to supply
    /// @param amount The amount to be supplied (in asset decimals)
    /// @param onBehalfOf The address that will receive the aTokens
    /// @param referralCode Code used to register the integrator (use 0 for no referral)
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /// @notice Withdraws an amount of underlying asset from the reserve
    /// @param asset The address of the underlying asset to withdraw
    /// @param amount The underlying amount to be withdrawn (in asset decimals)
    ///               Use type(uint256).max to withdraw the entire balance
    /// @param to The address that will receive the underlying asset
    /// @return The final amount withdrawn
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);

    /// @notice Allows users to borrow a specific amount of the underlying asset
    /// @param asset The address of the underlying asset to borrow
    /// @param amount The amount to be borrowed (in asset decimals)
    /// @param interestRateMode The interest rate mode (1 = stable, 2 = variable)
    /// @param referralCode Code used to register the integrator (use 0 for no referral)
    /// @param onBehalfOf The address that will incur the debt
    function borrow(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        uint16 referralCode,
        address onBehalfOf
    ) external;

    /// @notice Repays a borrowed amount on a specific reserve
    /// @param asset The address of the borrowed underlying asset
    /// @param amount The amount to repay (in asset decimals)
    ///               Use type(uint256).max to repay the entire debt
    /// @param interestRateMode The interest rate mode (1 = stable, 2 = variable)
    /// @param onBehalfOf The address of the user who will get his debt reduced
    /// @return The final amount repaid
    function repay(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        address onBehalfOf
    ) external returns (uint256);

    /// @notice Returns the normalized income of the reserve
    /// @param asset The address of the underlying asset
    /// @return The reserve's normalized income (scaled by 1e27)
    function getReserveNormalizedIncome(address asset)
        external
        view
        returns (uint256);

    /// @notice Returns the configuration of the reserve
    /// @param asset The address of the underlying asset
    /// @return Configuration data for the reserve
    function getConfiguration(address asset)
        external
        view
        returns (DataTypes.ReserveConfigurationMap memory);

    /// @notice Returns the reserve data
    /// @param asset The address of the underlying asset
    /// @return Reserve data
    function getReserveData(address asset)
        external
        view
        returns (DataTypes.ReserveData memory);
}

/// @title DataTypes - Data structures used by Aave V3
library DataTypes {
    struct ReserveData {
        ReserveConfigurationMap configuration;
        uint128 liquidityIndex;
        uint128 currentLiquidityRate;
        uint128 variableBorrowIndex;
        uint128 currentVariableBorrowRate;
        uint128 currentStableBorrowRate;
        uint40 lastUpdateTimestamp;
        uint16 id;
        address aTokenAddress;
        address stableDebtTokenAddress;
        address variableDebtTokenAddress;
        address interestRateStrategyAddress;
        uint128 accruedToTreasury;
        uint128 unbacked;
        uint128 isolationModeTotalDebt;
    }

    struct ReserveConfigurationMap {
        uint256 data;
    }
}


