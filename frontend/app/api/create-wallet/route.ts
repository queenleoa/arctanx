import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

export async function POST() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create wallet set
    const walletSetResponse = await client.createWalletSet({
      name: `Wallet Set for ${userId}`,
    });

    if (!walletSetResponse.data?.walletSet?.id) {
      throw new Error('Failed to create wallet set');
    }

    const walletSetId = walletSetResponse.data.walletSet.id;

    // Create EVM wallets (Arc + Base + Avax) with SAME address using refId
    // Using EOA (default) instead of SCA for Gateway compatibility
    const evmWalletsResponse = await client.createWallets({
      blockchains: ['ARC-TESTNET', 'BASE-SEPOLIA', 'AVAX-FUJI'],
      count: 1,
      walletSetId,
      metadata: [{ refId: 'gateway-evm-wallet' }], // This ensures same address on all chains
    });

    if (!evmWalletsResponse.data?.wallets || evmWalletsResponse.data.wallets.length < 3) {
      throw new Error('Failed to create EVM wallets on all networks');
    }

    const evmWallets = evmWalletsResponse.data.wallets;

    // Create Solana wallet separately (different address, EOA by default)
    const solanaWalletsResponse = await client.createWallets({
      blockchains: ['SOL-DEVNET'],
      count: 1,
      walletSetId,
      // No refId here - Solana will have its own address
    });

    if (!solanaWalletsResponse.data?.wallets || solanaWalletsResponse.data.wallets.length === 0) {
      throw new Error('Failed to create Solana wallet');
    }

    const solanaWallet = solanaWalletsResponse.data.wallets[0];

    // All EVM chains (Arc, Base, Avax) will have the SAME address (via refId)
    const sharedAddress = evmWallets[0].address;
    const arcWallet = evmWallets.find((w: any) => w.blockchain === 'ARC-TESTNET');
    const baseWallet = evmWallets.find((w: any) => w.blockchain === 'BASE-SEPOLIA');
    const avaxWallet = evmWallets.find((w: any) => w.blockchain === 'AVAX-FUJI');

    return NextResponse.json({
      walletSetId,
      sharedAddress, // Same address on Arc, Base, and Avax
      wallets: {
        arc: {
          address: arcWallet?.address,
          walletId: arcWallet?.id,
          blockchain: 'ARC-TESTNET',
        },
        base: {
          address: baseWallet?.address,
          walletId: baseWallet?.id,
          blockchain: 'BASE-SEPOLIA',
        },
        avax: {
          address: avaxWallet?.address,
          walletId: avaxWallet?.id,
          blockchain: 'AVAX-FUJI',
        },
        solana: {
          address: solanaWallet.address,
          walletId: solanaWallet.id,
          blockchain: 'SOL-DEVNET',
        },
      },
    });

  } catch (error: any) {
    console.error('Error creating wallets:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create wallets' },
      { status: 500 }
    );
  }
}