// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Constants - All contract addresses and domain IDs for deployment
/// @dev Update these if any addresses change or for mainnet deployment

library Constants {
    // ═══════════════════════════════════════════════════════════════════
    //                      DOMAIN IDS (CCTP)
    // ═══════════════════════════════════════════════════════════════════
    uint32 constant ARC_TESTNET_DOMAIN = 26;
    uint32 constant ETH_SEPOLIA_DOMAIN = 0;

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
    address constant ARC_MESSAGE = 0xbaC0179bB358A8936169a63408C8481D582390C4;

    // ═══════════════════════════════════════════════════════════════════
    //                  ETHERUEM SEPOLIA ADDRESSES
    // ═══════════════════════════════════════════════════════════════════
    // USDC on Ethereum Sepolia (6 decimals) — this is the CCTP-minted USDC
    address constant ETH_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    // CCTP V2 Contracts on Arbitrum Sepolia
    address constant ETH_TOKEN_MESSENGER = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    address constant ETH_MESSAGE_TRANSMITTER = 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275;
    address constant ETH_TOKEN_MINTER=0xb43db544E2c27092c107639Ad201b3dEfAbcF192;
    address constant ETH_MESSAGE=0xbaC0179bB358A8936169a63408C8481D582390C4;

    // Aave V3 on ETH Sepolia
    // NOTE: This is the standard Aave V3 Pool address. 
    address constant ETH_AAVE_USDC_RESERVE = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
    address constant ETH_AAVE_V3_POOL=0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;
    address constant ETH_AAVE_POOL_ADDRESS_PROVIDER=0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A;
    // Aave aUSDC on Eth Sepolia
    address constant ETH_AUSDC = 0x16dA4541aD1807f4443d92D26044C1147406EB80;

    // ═══════════════════════════════════════════════════════════════════
    //                    PRICE FEED DEFAULTS
    // ═══════════════════════════════════════════════════════════════════
    // EUR/USD ~1.08 with 8 decimals
    uint256 constant DEFAULT_EURUSD_PRICE = 108000000; // 1.08
    // USD/EUR ~0.926 with 8 decimals
    uint256 constant DEFAULT_USDEUR_PRICE = 92600000;  // 0.926
}
