// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PerpsDEX} from "../src/PerpsDEX.sol";
import {MarginVault} from "../src/MarginVault.sol";

/// @notice Deploy MarginVault on Arbitrum Sepolia FIRST
/// Usage: forge script script/Deploy.s.sol:DeployMarginVault --rpc-url $ARB_SEPOLIA_RPC --broadcast
contract DeployMarginVault is Script {
    function run() external {
        // Placeholder PerpsDEX address — update after deploying PerpsDEX
        address perpsDex = vm.envAddress("PERPS_DEX_ADDRESS");

        vm.startBroadcast();
        MarginVault vault = new MarginVault(perpsDex);
        vm.stopBroadcast();

        console.log("=== MarginVault (Arb Sepolia) ===");
        console.log("  Address:", address(vault));
        console.log("  PerpsDEX (Arc):", perpsDex);
        console.log("  CCTP TokenMessenger:", vault.TOKEN_MESSENGER());
        console.log("  Arc domain:", vault.ARC_DOMAIN());
    }
}

/// @notice Deploy PerpsDEX on Arc Testnet SECOND
/// Usage: forge script script/Deploy.s.sol:DeployPerpsDEX --rpc-url $ARC_TESTNET_RPC --broadcast
contract DeployPerpsDEX is Script {
    function run() external {
        address marginVault = vm.envAddress("MARGIN_VAULT_ADDRESS");

        // Funding rate: ~0.01% per hour = 2.78e-8/sec → scaled 1e18 = 2.78e10
        uint256 fundingRate = 27_800_000_000;

        vm.startBroadcast();
        PerpsDEX dex = new PerpsDEX(marginVault, fundingRate);
        vm.stopBroadcast();

        console.log("=== PerpsDEX (Arc Testnet) ===");
        console.log("  Address:", address(dex));
        console.log("  MarginVault (Arb Sepolia):", marginVault);
        console.log("  CCTP TokenMessenger:", dex.TOKEN_MESSENGER());
        console.log("  Arb Sepolia domain:", dex.ARB_SEPOLIA_DOMAIN());
        console.log("  USDC:", dex.ARC_USDC());
        console.log("  EURC:", dex.ARC_EURC());
        console.log("  Funding rate/sec:", fundingRate);
    }
}

/// @notice Update MarginVault with actual PerpsDEX address (run after both deploys)
/// Usage: forge script script/Deploy.s.sol:LinkContracts --rpc-url $ARB_SEPOLIA_RPC --broadcast
contract LinkContracts is Script {
    function run() external {
        address vaultAddr = vm.envAddress("MARGIN_VAULT_ADDRESS");
        address perpsDex = vm.envAddress("PERPS_DEX_ADDRESS");

        vm.startBroadcast();
        MarginVault vault = MarginVault(vaultAddr);
        vault.setPerpsDex(perpsDex);
        vm.stopBroadcast();

        console.log("=== Updated MarginVault ===");
        console.log("  PerpsDEX recipient updated to:", perpsDex);
    }
}
