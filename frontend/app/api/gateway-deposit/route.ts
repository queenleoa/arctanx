import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

// Gateway Wallet contract – same address on all EVM testnets
const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';

// USDC contract addresses per chain
const USDC_ADDRESSES: Record<string, string> = {
  'ARC-TESTNET': '0x3600000000000000000000000000000000000000',
  'AVAX-FUJI': '0x5425890298aed601595a70AB815c96711a31Bc65',
  'BASE-SEPOLIA': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

// All chains use 6 decimals for ERC-20 USDC (even Arc, where native is 18)
const USDC_DECIMALS = 6;

/**
 * Poll a Circle transaction until it settles or fails.
 * Returns the final transaction state.
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

    const { walletId, blockchain, amount } = await request.json();

    if (!walletId || !blockchain || !amount) {
      return NextResponse.json({ error: 'Missing walletId, blockchain, or amount' }, { status: 400 });
    }

    const usdcAddress = USDC_ADDRESSES[blockchain];
    if (!usdcAddress) {
      return NextResponse.json({ error: `Unsupported blockchain: ${blockchain}` }, { status: 400 });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Convert to smallest unit (6 decimals)
    const amountAtomic = Math.floor(parsedAmount * 10 ** USDC_DECIMALS).toString();

    console.log(`[gateway-deposit] chain=${blockchain} wallet=${walletId} amount=${parsedAmount} USDC (${amountAtomic} atomic)`);

    // ── Step 1: Approve Gateway Wallet to spend USDC ──────────────────
    console.log('[gateway-deposit] Sending approve tx...');
    const approvalRes = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: usdcAddress,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [GATEWAY_WALLET_ADDRESS, amountAtomic],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });

    const approvalTxId = approvalRes.data?.id;
    if (!approvalTxId) {
      throw new Error('Failed to create approval transaction');
    }
    console.log(`[gateway-deposit] Approval tx created: ${approvalTxId}`);

    // Wait for approval to confirm
    const approvalTx = await pollTransaction(approvalTxId);
    console.log(`[gateway-deposit] Approval confirmed: ${approvalTx.txHash}`);

    // ── Step 2: Deposit USDC into Gateway Wallet ──────────────────────
    console.log('[gateway-deposit] Sending deposit tx...');
    const depositRes = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: GATEWAY_WALLET_ADDRESS,
      abiFunctionSignature: 'deposit(address,uint256)',
      abiParameters: [usdcAddress, amountAtomic],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });

    const depositTxId = depositRes.data?.id;
    if (!depositTxId) {
      throw new Error('Failed to create deposit transaction');
    }
    console.log(`[gateway-deposit] Deposit tx created: ${depositTxId}`);

    // Wait for deposit to confirm
    const depositTx = await pollTransaction(depositTxId);
    console.log(`[gateway-deposit] Deposit confirmed: ${depositTx.txHash}`);

    return NextResponse.json({
      success: true,
      message: `Deposited ${parsedAmount} USDC to Gateway from ${blockchain}. Your unified balance will update after finality (typically a few minutes).`,
      approvalTxHash: approvalTx.txHash,
      depositTxHash: depositTx.txHash,
    });
  } catch (error: any) {
    console.error('[gateway-deposit] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Gateway deposit failed' },
      { status: 500 },
    );
  }
}