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

    const { walletId, recipient, amount } = await request.json();

    if (!walletId || !recipient || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Convert amount to smallest unit (6 decimals for USDC)
    const amountInSmallestUnit = (parseFloat(amount) * 1_000_000).toString();

    // Get token ID for Arc USDC (native token)
    // For Arc testnet, USDC is the native gas token
    const tokensResponse = await client.listTokens({
      blockchain: 'ARC-TESTNET',
    });

    const usdcToken = tokensResponse.data?.tokens?.find(
      (t: any) => t.symbol === 'USDC' && t.blockchain === 'ARC-TESTNET'
    );

    if (!usdcToken?.id) {
      throw new Error('USDC token not found on Arc testnet');
    }

    // Create transaction - using correct SDK parameter names
    const transactionResponse = await client.createTransaction({
      walletId,
      tokenId: usdcToken.id,
      destinationAddress: recipient,
      amounts: [amountInSmallestUnit],  // SDK accepts "amounts" array
      fee: {
        type: 'level',
        config: {
          feeLevel: 'MEDIUM',
        },
      },
    } as any);  // Type assertion to handle SDK type mismatch

    if (!transactionResponse.data) {
      throw new Error('Failed to create transaction');
    }

    // Response structure may vary - handle both formats
    const txData = transactionResponse.data as any;

    return NextResponse.json({
      success: true,
      transactionId: txData.id || txData.challengeId || 'pending',
      state: txData.state || txData.status || 'INITIATED',
    });

  } catch (error: any) {
    console.error('Transaction error:', error);
    return NextResponse.json(
      { error: error.message || 'Transaction failed' },
      { status: 500 }
    );
  }
}