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

    const { walletId, recipient, amount, blockchain } = await request.json();

    if (!walletId || !recipient || !amount || !blockchain) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get token ID for the blockchain
    const tokensResponse = await client.listTokens({
      blockchain: blockchain as any,
    });

    const usdcToken = tokensResponse.data?.tokens?.find(
      (t: any) => t.symbol === 'USDC' && t.blockchain === blockchain
    );

    if (!usdcToken?.id) {
      throw new Error(`USDC token not found on ${blockchain}`);
    }

    // Convert amount based on blockchain (Arc uses 6 decimals for transfers)
    const decimals = 6; // USDC uses 6 decimals
    const amountInSmallestUnit = (parseFloat(amount) * Math.pow(10, decimals)).toString();

    // Create transaction
    const transactionResponse = await client.createTransaction({
      walletId,
      tokenId: usdcToken.id,
      destinationAddress: recipient,
      amount: [amountInSmallestUnit],
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
    });

  } catch (error: any) {
    console.error('Transaction error:', error);
    return NextResponse.json(
      { error: error.message || 'Transaction failed' },
      { status: 500 }
    );
  }
}
