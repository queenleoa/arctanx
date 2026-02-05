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

    // Create wallet on Arc testnet
    const walletResponse = await client.createWallets({
      accountType: 'SCA',
      blockchains: ['ARC-TESTNET'],
      count: 1,
      walletSetId,
    });

    if (!walletResponse.data?.wallets?.[0]) {
      throw new Error('Failed to create wallet');
    }

    const wallet = walletResponse.data.wallets[0];

    return NextResponse.json({
      address: wallet.address,
      walletId: wallet.id,
      walletSetId,
    });

  } catch (error: any) {
    console.error('Error creating wallet:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create wallet' },
      { status: 500 }
    );
  }
}