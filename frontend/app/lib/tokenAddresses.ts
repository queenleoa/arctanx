// Token contract addresses for USDC and EURC on different chains

export const TOKEN_ADDRESSES = {
  'ARC-TESTNET': {
    // Arc Testnet uses native USDC (no contract address needed for balance)
    // USDC is the native gas token on Arc
    USDC: '0x3600000000000000000000000000000000000000', // Special case - use getBalance
    EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', // Add EURC contract address if available
  },
  'BASE-SEPOLIA': {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
    EURC: '0x808456652fdb597867f38412077A9182bf77359F', // Add EURC contract address if available
  },
  'SOL-DEVNET': {
    USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Solana Devnet USDC mint
    EURC: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr', // Add EURC mint address if available
  },
} as const;

export const USDC_DECIMALS = {
  'ARC-TESTNET': 18, // Arc uses 18 decimals for native USDC
  'BASE-SEPOLIA': 6, // Standard USDC decimals
  'SOL-DEVNET': 6, // Standard USDC decimals
} as const;

export const EURC_DECIMALS = {
  'ARC-TESTNET': 6,
  'BASE-SEPOLIA': 6,
  'SOL-DEVNET': 6,
} as const;