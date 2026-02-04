import { NextResponse } from 'next/server';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!
});

let walletSetId: string | null = null;

export async function POST() {
  try {
    if (!walletSetId) {
      const walletSetResponse = await client.createWalletSet({
        name: 'Demo Wallet Set'
      });
      walletSetId = walletSetResponse.data.walletSet.id;
    }

    const walletResponse = await client.createWallets({
      accountType: 'EOA',
      blockchains: ['ARC-TESTNET'],
      count: 1,
      walletSetId: walletSetId
    });

    const wallet = walletResponse.data.wallets[0];
    
    return NextResponse.json({
      address: wallet.address,
      walletId: wallet.id
    });
  } catch (error) {
    console.error('Error creating wallet:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}