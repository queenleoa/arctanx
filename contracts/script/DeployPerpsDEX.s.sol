// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/arc/PerpsDEX.sol";

/// @title DeployPerpsDEX
/// @notice Deploy PerpsDEX to Arc Testnet
/// @dev Usage:
///   1. Deploy MarginVault on Ethsepolia FIRST
///   2. Set MARGIN_VAULT_ADDRESS env var
///   3. Run:
///      forge script script/DeployPerpsDEX.s.sol:DeployPerpsDEX \
///        --rpc-url $ARC_TESTNET_RPC_URL \
///        --private-key $PRIVATE_KEY \
///        --broadcast

contract DeployPerpsDEX is Script {
    // ════════════════════════════════════════════════════════════════════
    //                    ARC TESTNET ADDRESSES
    // ════════════════════════════════════════════════════════════════════
    
    // USDC on Arc Testnet (18 decimals — native gas token wrapper)
    address constant USDC = 0x3600000000000000000000000000000000000000;
    
    // EURC on Arc Testnet (6 decimals)
    address constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    
    // CCTP TokenMessenger
    address constant TOKEN_MESSENGER = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    
    // Stork Oracle on Arc Testnet
    // Set via env var or update this constant
    // For testing, deploy MockStorkOracle first

    function run() external {
        // MarginVault address on Arbitrum Sepolia (required)
        address marginVault = vm.envAddress("MARGIN_VAULT_ADDRESS");
        require(marginVault != address(0), "MARGIN_VAULT_ADDRESS not set");
        
        // Stork Oracle - try env var first, fallback to zero
        address storkOracle = vm.envOr("STORK_ORACLE_ADDRESS", address(0));

        vm.startBroadcast();

        // Constructor needs 5 parameters:
        // 1. USDC address
        // 2. EURC address  
        // 3. TokenMessenger address (CCTP)
        // 4. Stork Oracle address (for EUR/USD prices)
        // 5. MarginVault address on Arbitrum
        PerpsDEX dex = new PerpsDEX(
            USDC,
            EURC,
            TOKEN_MESSENGER,
            storkOracle,
            marginVault
        );

        vm.stopBroadcast();

        console.log(" PerpsDEX Deployed on Arc Testnet");
        console.log("");
        console.log("PerpsDEX:           ", address(dex));
        console.log("USDC:               ", USDC);
        console.log("EURC:               ", EURC);
        console.log("TokenMessenger:     ", TOKEN_MESSENGER);
        console.log("Stork Oracle:       ", storkOracle);
        console.log("MarginVault (Arb):  ", marginVault);
        console.log("");

        if (storkOracle == address(0)) {
            console.log("WARNING: Stork Oracle address is ZERO!");
            console.log("");
            console.log("You MUST deploy a Stork Oracle. Two options:");
            console.log("");
            console.log("Option 1: Deploy MockStorkOracle for testing");
            console.log("  forge create src/mocks/MockStorkOracle.sol:MockStorkOracle \\");
            console.log("    --rpc-url $ARC_TESTNET_RPC_URL \\");
            console.log("    --private-key $PRIVATE_KEY");
            console.log("");
            console.log("  Then set the price:");
            console.log("  cast send <ORACLE_ADDRESS> 'setPrice(bytes32,int192)' \\");
            console.log("    0x4555525553440000000000000000000000000000000000000000000000000000 \\");
            console.log("    1080000000000000000 \\");
            console.log("    --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY");
            console.log("");
            console.log("Option 2: Use real Stork Oracle");
            console.log("  Contact Stork Network for Arc Testnet deployment");
            console.log("");
        }

        console.log("Next steps:");
        console.log("1. Deploy/configure Stork Oracle (see above)");
        console.log("2. Update MarginVault.setPerpsDex() on Arbitrum");
        console.log("3. Fund test wallets with USDC/EURC");
        console.log("4. Start relayer daemon");
        console.log("");
        console.log("Quick commands:");
        console.log("  # Update MarginVault");
        console.log("  cast send $MARGIN_VAULT 'setPerpsDex(address)' ", address(dex));
        console.log("    --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --private-key $PRIVATE_KEY");
        console.log("");
        console.log("  # Update oracle in PerpsDEX (if you deployed oracle after)");
        console.log("  cast send ", address(dex), " 'setStorkOracle(address)' <ORACLE_ADDRESS>");
        console.log("    --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY");
    }
}
