// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/arc/PerpsDEX.sol";
import "./Constants.sol";

/// @title DeployPerpsDEX - Deploy PerpsDEX to Arc Testnet
/// @dev Usage:
///   1. Deploy MarginVault on Arbitrum Sepolia FIRST to get its address
///   2. Set MARGIN_VAULT_ADDRESS env var
///   3. Run:
///      forge script script/DeployPerpsDEX.s.sol:DeployPerpsDEX \
///        --rpc-url $ARC_TESTNET_RPC_URL \
///        --private-key $PRIVATE_KEY \
///        --broadcast

contract DeployPerpsDEX is Script {
    function run() external {
        // MarginVault address on Arbitrum Sepolia (deploy that first)
        address marginVault = vm.envAddress("MARGIN_VAULT_ADDRESS");

        vm.startBroadcast();

        PerpsDEX dex = new PerpsDEX(
            Constants.ARC_USDC,
            Constants.ARC_TOKEN_MESSENGER,
            marginVault
        );

        // Set initial prices for trading pairs
        bytes32 eurusd = keccak256(abi.encodePacked("EURUSD"));
        bytes32 usdeur = keccak256(abi.encodePacked("USDEUR"));

        dex.setPrice(eurusd, Constants.DEFAULT_EURUSD_PRICE);
        dex.setPrice(usdeur, Constants.DEFAULT_USDEUR_PRICE);

        vm.stopBroadcast();

        console.log("=== PerpsDEX Deployed on Arc Testnet ===");
        console.log("PerpsDEX:", address(dex));
        console.log("MarginVault (Arbitrum):", marginVault);
        console.log("USDC:", Constants.ARC_USDC);
        console.log("TokenMessenger:", Constants.ARC_TOKEN_MESSENGER);
        console.log("EURUSD pair hash:", vm.toString(eurusd));
        console.log("USDEUR pair hash:", vm.toString(usdeur));
    }
}
