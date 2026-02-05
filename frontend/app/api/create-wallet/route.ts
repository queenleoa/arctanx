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

    // Create ONE wallet that exists on multiple EVM chains
    // This gives the SAME address on Arc and Base for Circle Gateway unification
    const walletsResponse = await client.createWallets({
      accountType: 'SCA',
      blockchains: ['ARC-TESTNET', 'BASE-SEPOLIA'],
      count: 1, // Single wallet, multiple chains
      walletSetId,
    });

    if (!walletsResponse.data?.wallets || walletsResponse.data.wallets.length < 2) {
      throw new Error('Failed to create wallet on all networks');
    }

    const wallets = walletsResponse.data.wallets;

    // Both Arc and Base will have the SAME address (EVM chains)
    const sharedAddress = wallets[0].address;
    const arcWallet = wallets.find((w: any) => w.blockchain === 'ARC-TESTNET');
    const baseWallet = wallets.find((w: any) => w.blockchain === 'BASE-SEPOLIA');

    return NextResponse.json({
      walletSetId,
      sharedAddress, // Same address on both chains
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
