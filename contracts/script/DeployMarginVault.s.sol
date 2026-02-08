// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MarginVault} from "../src/ethereum/MarginVault.sol";

/// @title DeployMarginVault - Deploy MarginVault to Eth Sepolia
/// @dev Run: forge script script/DeployMarginVault.s.sol --rpc-url $ETH_SEPOLIA_RPC --broadcast --verify
contract DeployMarginVault is Script {
    // Aave V3 on Eth Sepolia (from aave-address-book)
    address constant AAVE_V3_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;
    
    // Aave's testnet mintable USDC on Sepolia (NOT Circle CCTP USDC)
    // This is the USDC that Aave's pool accepts as a reserve
    address constant AAVE_USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
    
    // aEthUSDC (Aave Ethereum USDC aToken)
    address constant AUSDC = 0x16dA4541aD1807f4443d92D26044C1147406EB80;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Aave Pool:", AAVE_V3_POOL);
        console.log("USDC (Aave testnet):", AAVE_USDC);
        console.log("aUSDC:", AUSDC);

        vm.startBroadcast(deployerPrivateKey);

        MarginVault vault = new MarginVault(AAVE_V3_POOL, AAVE_USDC, AUSDC);

        console.log("=== MarginVault deployed ===");
        console.log("Address:", address(vault));
        console.log("Owner:", vault.owner());

        vm.stopBroadcast();
    }
}
