// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/arbitrum/MarginVault.sol";
import "./Constants.sol";

/// @title DeployMarginVault - Deploy MarginVault to Arbitrum Sepolia
/// @dev Deploy this FIRST, then use its address to deploy PerpsDEX on Arc.
///
///   forge script script/DeployMarginVault.s.sol:DeployMarginVault \
///     --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast
///
///   After deploying PerpsDEX, update MarginVault with:
///     cast send $MARGIN_VAULT "setPerpsDex(address)" $PERPS_DEX_ADDRESS \
///       --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --private-key $PRIVATE_KEY

contract DeployMarginVault is Script {
    function run() external {
        // PerpsDEX address on Arc — use placeholder, update post-deploy
        // If you know the PerpsDEX address already, set it via env var:
        address perpsDex = vm.envOr("PERPS_DEX_ADDRESS", address(0));

        vm.startBroadcast();

        MarginVault vault = new MarginVault(
            Constants.ARB_USDC,
            Constants.ARB_AUSDC,
            Constants.ARB_AAVE_POOL,
            Constants.ARB_TOKEN_MESSENGER,
            perpsDex
        );

        vm.stopBroadcast();

        console.log("=== MarginVault Deployed on Arbitrum Sepolia ===");
        console.log("MarginVault:", address(vault));
        console.log("USDC:", Constants.ARB_USDC);
        console.log("aUSDC:", Constants.ARB_AUSDC);
        console.log("Aave Pool:", Constants.ARB_AAVE_POOL);
        console.log("TokenMessenger:", Constants.ARB_TOKEN_MESSENGER);
        console.log("PerpsDEX (Arc):", perpsDex);

        if (perpsDex == address(0)) {
            console.log("");
            console.log("WARNING: PerpsDEX address is zero.");
            console.log("After deploying PerpsDEX on Arc, call:");
            console.log("  vault.setPerpsDex(<PERPS_DEX_ADDRESS>)");
        }
    }
}
