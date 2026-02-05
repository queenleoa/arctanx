import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { walletId, recipient, amount, blockchain, asset = 'USDC' } = await request.json();

    if (!walletId || !recipient || !amount || !blockchain) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Determine decimals based on blockchain and asset
    let decimals = 6; // Default for most USDC implementations
    
    if (blockchain === 'ARC-TESTNET' && asset === 'USDC') {
      decimals = 18; // Arc native USDC uses 18 decimals
    }

    const amountInSmallestUnit = (parseFloat(amount) * Math.pow(10, decimals)).toString();

    // For Circle API, we need to specify the token ID
    // The API will look up the appropriate token based on blockchain and symbol
    const transactionResponse = await client.createTransaction({
      walletId,
      blockchain: blockchain as any,
      tokenAddress: asset === 'USDC' ? undefined : undefined, // Let Circle resolve this
      destinationAddress: recipient,
      amounts: [amountInSmallestUnit],
      fee: {
        type: 'level',
        config: {
          feeLevel: 'MEDIUM',
        },
      },
    });

    if (!transactionResponse.data) {
      throw new Error('Failed to create transaction');
    }

    return NextResponse.json({
      success: true,
      transactionId: transactionResponse.data.id || 'pending',
      challengeId: transactionResponse.data.challengeId,
    });

  } catch (error: any) {
    console.error('Transaction error:', error);
    return NextResponse.json(
      { error: error.message || 'Transaction failed' },
      { status: 500 }
    );
  }
}