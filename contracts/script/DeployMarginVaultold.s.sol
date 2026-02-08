// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// import "forge-std/Script.sol";
// import "../src/ethereum/MarginVault.sol";

// /// @title DeployMarginVault
// /// @notice Deploy MarginVault to Arbitrum Sepolia
// /// @dev Usage:
// ///   forge script script/DeployMarginVault.s.sol:DeployMarginVault \
// ///     --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
// ///     --private-key $PRIVATE_KEY \
// ///     --broadcast

// contract DeployMarginVault is Script {
//     // ════════════════════════════════════════════════════════════════════
//     //                    ARBITRUM SEPOLIA ADDRESSES
//     // ════════════════════════════════════════════════════════════════════
    
//     // Tokens (6 decimals)
//     address constant USDC = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;
//     address constant EURC = address(0); // TODO: Add if EURC is available on Arb Sepolia
    
//     // Aave aTokens (6 decimals)
//     address constant aUSDC = 0x625E7708f30cA75bfd92586e17077590C60eb4cD;
//     address constant aEURC = address(0); // TODO: Add if available
    
//     // Aave V3 Pool
//     address constant AAVE_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;
    
//     // CCTP
//     address constant TOKEN_MESSENGER = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;

//     function run() external {
//         // PerpsDEX address on Arc - use env var or placeholder
//         address perpsDex = vm.envOr("PERPS_DEX_ADDRESS", address(0));

//         vm.startBroadcast();

//         // Constructor needs 7 parameters:
//         // 1. USDC address
//         // 2. EURC address
//         // 3. aUSDC address (Aave interest-bearing token)
//         // 4. aEURC address (Aave interest-bearing token)
//         // 5. Aave Pool address
//         // 6. TokenMessenger address (CCTP)
//         // 7. PerpsDEX address on Arc
//         MarginVault vault = new MarginVault(
//             USDC,
//             aUSDC,
//             AAVE_POOL,
//             TOKEN_MESSENGER,
//             perpsDex
//         );

//         vm.stopBroadcast();

//         console.log("MarginVault Deployed on Arbitrum Sepolia");
//         console.log("");
//         console.log("MarginVault:      ", address(vault));
//         console.log("USDC:             ", USDC);
//         console.log("aUSDC:            ", aUSDC);
//         console.log("Aave Pool:        ", AAVE_POOL);
//         console.log("TokenMessenger:   ", TOKEN_MESSENGER);
//         console.log("PerpsDEX (Arc):   ", perpsDex);
//         console.log("");

//         if (perpsDex == address(0)) {
//             console.log("WARNING: PerpsDEX address is zero");
//             console.log("After deploying PerpsDEX on Arc, call:");
//             console.log("  vault.setPerpsDex(<PERPS_DEX_ADDRESS>)");
//             console.log("");
//         }

//         console.log("Next steps:");
//         console.log("1. Deploy PerpsDEX on Arc Testnet");
//         console.log("2. Update PerpsDEX address in MarginVault");
//         console.log("3. Fund relayer wallet with ETH on both chains");
//         console.log("4. Start relayer daemon");
//     }
// }
