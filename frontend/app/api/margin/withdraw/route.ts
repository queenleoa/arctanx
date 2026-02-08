// frontend/app/api/margin/withdraw/route.ts
//
// Cross-chain margin withdrawal: Ethereum Sepolia → Arc Testnet
// Uses Bridge Kit with Circle Wallets adapter (server-side only)
//
// Flow:
//   1. Frontend sends { positionId, exitPrice }
//   2. This route calculates PnL, withdraws from Aave, bridges USDC back to Arc
//   3. Returns bridge result + final PnL
//
// Prerequisites:
//   npm install @circle-fin/bridge-kit @circle-fin/adapter-circle-wallets ethers

import { NextRequest, NextResponse } from 'next/server';
import { BridgeKit } from '@circle-fin/bridge-kit';
import type { BridgeResult } from '@circle-fin/bridge-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { ethers } from 'ethers';

// Re-use position store from deposit route
// In production, use a shared DB instead of in-memory Map
import { positions } from '../deposit/route';

// ─── Config ──────────────────────────────────────────────────────────────
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY!;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;
const MARGIN_VAULT_ADDRESS = process.env.MARGIN_VAULT_ETH_SEPOLIA!;
const ETH_SEPOLIA_RPC = process.env.ETH_SEPOLIA_RPC || 'https://rpc.sepolia.org';
const VAULT_OWNER_PRIVATE_KEY = process.env.VAULT_OWNER_PRIVATE_KEY!;

// Minimal MarginVault ABI — only the functions we call
const VAULT_ABI = [
  'function releaseMargin(uint256 positionId, address recipient, uint256 amount) external',
  'function withdrawFromAave(uint256 positionId) external returns (uint256)',
  'function getDeposit(uint256 positionId) external view returns (tuple(uint256 amount, uint256 depositTime, bool inAave, bool withdrawn))',
];

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Extract tx hash from BridgeResult.steps by step name */
function getStepTxHash(result: BridgeResult, stepName: string): string | undefined {
  return result.steps.find(
    (s) => s.name.toLowerCase().includes(stepName.toLowerCase())
  )?.txHash;
}

// ─── POST /api/margin/withdraw ───────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { positionId, exitPrice } = body;

    if (positionId === undefined || !exitPrice) {
      return NextResponse.json(
        { error: 'Missing required fields: positionId, exitPrice' },
        { status: 400 }
      );
    }

    // ── Look up position ──────────────────────────────────────────────
    const position = positions.get(positionId);
    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    }
    if (position.status !== 'active') {
      return NextResponse.json(
        { error: `Position is ${position.status}, not active` },
        { status: 400 }
      );
    }

    position.status = 'closing';

    // ── Calculate PnL ─────────────────────────────────────────────────
    const entry = parseFloat(position.entryPrice);
    const exit = parseFloat(exitPrice);
    const margin = parseFloat(position.amount);
    const priceDelta = position.isLong ? (exit - entry) / entry : (entry - exit) / entry;
    const pnl = margin * position.leverage * priceDelta;
    const payout = Math.max(0, margin + pnl); // Can't go negative

    console.log(`[margin/withdraw] Position ${positionId}:`);
    console.log(`  Entry: ${entry}, Exit: ${exit}, PnL: ${pnl.toFixed(6)}`);
    console.log(`  Payout: ${payout.toFixed(6)} USDC`);

    // ── Release margin from vault on Eth Sepolia ──────────────────────
    //
    // 1. Call releaseMargin() — this withdraws from Aave if needed and
    //    transfers USDC to a wallet that Bridge Kit can bridge from.
    // 2. Then Bridge Kit sends USDC from Eth Sepolia → Arc.
    //
    const provider = new ethers.JsonRpcProvider(ETH_SEPOLIA_RPC);
    const signer = new ethers.Wallet(VAULT_OWNER_PRIVATE_KEY, provider);
    const vault = new ethers.Contract(MARGIN_VAULT_ADDRESS, VAULT_ABI, signer);

    // Convert to 6-decimal USDC amount
    const payoutWei = ethers.parseUnits(payout.toFixed(6), 6);

    // Release margin to the signer's address (which Bridge Kit will bridge from)
    const releaseTx = await vault.releaseMargin(positionId, signer.address, payoutWei);
    const releaseReceipt = await releaseTx.wait();
    console.log(`[margin/withdraw] releaseMargin tx: ${releaseReceipt.hash}`);

    // ── Bridge USDC back to Arc ───────────────────────────────────────
    const kit = new BridgeKit();

    const adapter = createCircleWalletsAdapter({
      apiKey: CIRCLE_API_KEY,
      entitySecret: CIRCLE_ENTITY_SECRET,
    });

    // Bridge from Eth Sepolia wallet → user's Arc wallet
    // Developer-controlled adapters require `address` field.
    // `recipientAddress` sends minted USDC to the user's wallet on Arc.
    const result: BridgeResult = await kit.bridge({
      from: {
        adapter,
        chain: 'Ethereum_Sepolia',
        address: position.trader,     // Same EVM address on Eth Sepolia
      },
      to: {
        adapter,
        chain: 'Arc_Testnet',
        address: position.trader,     // User's wallet on Arc
      },
      amount: payout.toFixed(6),
      token: 'USDC',
    });

    console.log('[margin/withdraw] Bridge result:', JSON.stringify({
      state: result.state,
      amount: result.amount,
      steps: result.steps.map(s => ({ name: s.name, state: s.state, txHash: s.txHash })),
    }, null, 2));

    // ── Extract tx hashes from result.steps ───────────────────────────
    const approveTxHash = getStepTxHash(result, 'approve');
    const burnTxHash = getStepTxHash(result, 'burn');
    const mintTxHash = getStepTxHash(result, 'mint');

    // ── Update position ───────────────────────────────────────────────
    position.status = 'closed';

    return NextResponse.json({
      success: result.state === 'success',
      positionId,
      pnl: {
        entryPrice: position.entryPrice,
        exitPrice,
        margin: position.amount,
        leverage: position.leverage,
        isLong: position.isLong,
        pnlAmount: pnl.toFixed(6),
        payout: payout.toFixed(6),
      },
      bridge: {
        state: result.state,
        amount: result.amount,
        releaseTxHash: releaseReceipt.hash,
        approveTxHash,
        burnTxHash,
        mintTxHash,
        steps: result.steps.map(s => ({
          name: s.name,
          state: s.state,
          txHash: s.txHash,
          explorerUrl: s.explorerUrl,
        })),
      },
    });

  } catch (error: any) {
    console.error('[margin/withdraw] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Withdrawal failed' },
      { status: 500 }
    );
  }
}