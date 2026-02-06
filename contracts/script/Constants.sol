// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Constants - All contract addresses and domain IDs for deployment
/// @dev Update these if any addresses change or for mainnet deployment

library Constants {
    // ═══════════════════════════════════════════════════════════════════
    //                      DOMAIN IDS (CCTP)
    // ═══════════════════════════════════════════════════════════════════
    uint32 constant ARC_TESTNET_DOMAIN = 26;
    uint32 constant ARBITRUM_SEPOLIA_DOMAIN = 3;
    uint32 constant BASE_SEPOLIA_DOMAIN = 6;

    // ═══════════════════════════════════════════════════════════════════
    //                    ARC TESTNET ADDRESSES
    // ═══════════════════════════════════════════════════════════════════
    // USDC on Arc Testnet (18 decimals — native gas token wrapper)
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    // EURC on Arc Testnet (6 decimals)
    address constant ARC_EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;

    // CCTP V2 Contracts on Arc Testnet
    address constant ARC_TOKEN_MESSENGER = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    address constant ARC_MESSAGE_TRANSMITTER = 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275;
    address constant ARC_TOKEN_MINTER = 0xb43db544E2c27092c107639Ad201b3dEfAbcF192;

    // ═══════════════════════════════════════════════════════════════════
    //                  ARBITRUM SEPOLIA ADDRESSES
    // ═══════════════════════════════════════════════════════════════════
    // USDC on Arbitrum Sepolia (6 decimals) — this is the CCTP-minted USDC
    address constant ARB_USDC = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;

    // CCTP V2 Contracts on Arbitrum Sepolia
    address constant ARB_TOKEN_MESSENGER = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    address constant ARB_MESSAGE_TRANSMITTER = 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275;

    // Aave V3 on Arbitrum Sepolia
    // NOTE: This is the standard Aave V3 Pool address. Verify it accepts
    //       the CCTP USDC (0x75faf1...) and not just USDC.e.
    //       If Aave uses a different USDC, you may need a swap step.
    address constant ARB_AAVE_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;

    // Aave aUSDC on Arbitrum Sepolia
    // NOTE: This may differ depending on which USDC Aave uses.
    //       Check Aave docs or query the pool for the correct aToken.
    address constant ARB_AUSDC = 0x625E7708f30cA75bfd92586e17077590C60eb4cD;

    // ═══════════════════════════════════════════════════════════════════
    //                   BASE SEPOLIA ADDRESSES
    // ═══════════════════════════════════════════════════════════════════
    address constant BASE_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant BASE_EURC = 0x808456652fdb597867f38412077A9182bf77359F;
    address constant BASE_TOKEN_MESSENGER = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;

    // ═══════════════════════════════════════════════════════════════════
    //                    PRICE FEED DEFAULTS
    // ═══════════════════════════════════════════════════════════════════
    // EUR/USD ~1.08 with 8 decimals
    uint256 constant DEFAULT_EURUSD_PRICE = 108000000; // 1.08
    // USD/EUR ~0.926 with 8 decimals
    uint256 constant DEFAULT_USDEUR_PRICE = 92600000;  // 0.926
}
