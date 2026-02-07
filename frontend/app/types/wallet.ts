export interface Wallet {
  address: string;
  walletId: string;
  blockchain: 'ARC-TESTNET' | 'AVAX-FUJI' | 'BASE-SEPOLIA' | 'SOL-DEVNET';
}

export interface WalletData {
  arc: Wallet;
  avax: Wallet;
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

export type SupportedChain = 'arc' | 'avax' | 'base' | 'solana';
export type SupportedAsset = 'USDC' | 'EURC';