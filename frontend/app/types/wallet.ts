export interface Wallet {
  address: string;
  walletId: string;
  blockchain: 'ARC-TESTNET' | 'BASE-SEPOLIA' | 'SOL-DEVNET';
}

export interface WalletData {
  arc: Wallet;
  base: Wallet;
  solana: Wallet;
}

export interface ChainBalance {
  usdc: string;
  eurc: string;
}

export interface WalletMetadata {
  walletSetId: string;
  wallets: WalletData;
  sharedAddress: string; // EVM shared address
}

export type SupportedChain = 'arc' | 'base' | 'solana';
export type SupportedAsset = 'USDC' | 'EURC';