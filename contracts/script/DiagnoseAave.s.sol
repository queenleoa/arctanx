// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title DiagnoseAave - Check supply caps via raw config bitmap
/// @dev Run: forge script script/DiagnoseAave.s.sol --rpc-url $ETH_SEPOLIA_RPC -vvvv

interface IAavePool {
    /// @notice Returns just the configuration bitmap (works across all Aave V3 versions)
    function getConfiguration(address asset) external view returns (uint256 data);
    function getReservesList() external view returns (address[] memory);
}

interface IAToken {
    function totalSupply() external view returns (uint256);
}

address constant AAVE_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;
address constant AAVE_USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
address constant AUSDC     = 0x16dA4541aD1807f4443d92D26044C1147406EB80;

contract DiagnoseAave is Script {

    function parseConfig(uint256 config) internal pure returns (
        uint256 supplyCap,
        uint256 borrowCap,
        uint256 ltv,
        bool isActive,
        bool isFrozen,
        bool isPaused
    ) {
        ltv = config & 0xFFFF;                          // bits 0-15
        isActive = ((config >> 56) & 1) == 1;           // bit 56
        isFrozen = ((config >> 57) & 1) == 1;           // bit 57
        isPaused = ((config >> 60) & 1) == 1;           // bit 60
        borrowCap = (config >> 80) & 0xFFFFFFFFF;       // bits 80-115 (36 bits)
        supplyCap = (config >> 116) & 0xFFFFFFFFF;      // bits 116-151 (36 bits)
    }

    function run() external view {
        IAavePool pool = IAavePool(AAVE_POOL);

        console.log("=== Aave V3 Sepolia USDC Diagnostics ===");
        console.log("");

        // Get config bitmap for USDC
        uint256 config = pool.getConfiguration(AAVE_USDC);
        console.log("Raw config:", config);

        (
            uint256 supplyCap,
            uint256 borrowCap,
            uint256 ltv,
            bool isActive,
            bool isFrozen,
            bool isPaused
        ) = parseConfig(config);

        console.log("");
        console.log("--- USDC Reserve Config ---");
        console.log("Active:", isActive);
        console.log("Frozen:", isFrozen);
        console.log("Paused:", isPaused);
        console.log("LTV:", ltv);
        console.log("Supply Cap (whole USDC tokens):", supplyCap);
        console.log("Borrow Cap (whole USDC tokens):", borrowCap);

        // Get current aUSDC total supply
        uint256 aTokenSupply = IAToken(AUSDC).totalSupply();
        console.log("");
        console.log("--- Current USDC Supply ---");
        console.log("aUSDC totalSupply (raw):", aTokenSupply);
        console.log("aUSDC totalSupply (USDC):", aTokenSupply / 1e6);

        if (supplyCap > 0) {
            uint256 supplyCapWei = supplyCap * 1e6; // USDC is 6 decimals
            console.log("Supply Cap (raw):", supplyCapWei);
            if (aTokenSupply >= supplyCapWei) {
                console.log("");
                console.log("!!! SUPPLY CAP REACHED - Cannot deposit more USDC !!!");
                console.log("Overfilled by:", (aTokenSupply - supplyCapWei) / 1e6, "USDC");
            } else {
                uint256 remaining = supplyCapWei - aTokenSupply;
                console.log("Remaining capacity:", remaining / 1e6, "USDC");
            }
        } else {
            console.log("No supply cap (unlimited)");
        }

        // Check ALL reserves for capacity
        console.log("");
        console.log("=== All Reserves Status ===");
        address[] memory reserves = pool.getReservesList();

        for (uint i = 0; i < reserves.length; i++) {
            uint256 rConfig = pool.getConfiguration(reserves[i]);
            (
                uint256 rSupplyCap, , ,
                bool rActive, bool rFrozen, bool rPaused
            ) = parseConfig(rConfig);

            if (!rActive) continue;

            string memory symbol = _trySymbol(reserves[i]);
            uint8 decimals = IERC20(reserves[i]).decimals();

            console.log("---");
            console.log("Reserve", i);
            console.log("  Address:", reserves[i]);
            console.log("  Symbol:", symbol);
            console.log("  Decimals:", decimals);
            console.log("  Supply Cap (whole tokens):", rSupplyCap);
            console.log("  Frozen:", rFrozen);
            console.log("  Paused:", rPaused);

            if (rSupplyCap == 0) {
                console.log("  >>> UNLIMITED CAPACITY <<<");
            }
        }
    }

    function _trySymbol(address token) internal view returns (string memory) {
        try IERC20(token).symbol() returns (string memory s) {
            return s;
        } catch {
            return "???";
        }
    }
}
