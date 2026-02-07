import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const TOKEN_ADDRESSES = {
  USDC: '0x3600000000000000000000000000000000000000',
  EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
};

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Max uint256 for unlimited allowance
const MAX_ALLOWANCE = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

/**
 * Poll a Circle transaction until it settles or fails.
 */
async function pollTransaction(txId: string, maxAttempts = 30, intervalMs = 3000): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await client.getTransaction({ id: txId });
    const state = res.data?.transaction?.state;

    if (state === 'COMPLETE' || state === 'CONFIRMED') return res.data?.transaction;
    if (state === 'FAILED' || state === 'CANCELLED' || state === 'DENIED') {
      throw new Error(`Transaction ${txId} ${state}: ${res.data?.transaction?.errorReason || 'unknown'}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Transaction ${txId} timed out after ${maxAttempts * intervalMs / 1000}s`);
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { walletId, currency } = await request.json();

    if (!walletId || !currency) {
      return NextResponse.json(
        { error: 'Missing walletId or currency' },
        { status: 400 }
      );
    }

    const tokenAddress = TOKEN_ADDRESSES[currency as 'USDC' | 'EURC'];
    if (!tokenAddress) {
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
    }

    console.log(`[grant-permit2-allowance] Granting ${currency} allowance to Permit2...`);

    // Call approve on the token contract
    const approvalRes = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: tokenAddress,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [PERMIT2_ADDRESS, MAX_ALLOWANCE],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });

    const approvalTxId = approvalRes.data?.id;
    if (!approvalTxId) {
      throw new Error('Failed to create approval transaction');
    }

    console.log(`[grant-permit2-allowance] Approval tx created: ${approvalTxId}`);

    // Wait for approval to confirm
    const approvalTx = await pollTransaction(approvalTxId);
    console.log(`[grant-permit2-allowance] Approval confirmed: ${approvalTx.txHash}`);

    return NextResponse.json({
      success: true,
      txHash: approvalTx.txHash,
    });
  } catch (error: any) {
    console.error('[grant-permit2-allowance] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to grant Permit2 allowance' },
      { status: 500 }
    );
  }
}