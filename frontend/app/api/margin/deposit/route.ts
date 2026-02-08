// frontend/app/api/margin/deposit/route.ts
//
// Cross-chain margin deposit: Arc Testnet → Ethereum Sepolia
// Uses Bridge Kit with Circle Wallets adapter (server-side only)
//
// Flow:
//   1. Frontend sends { walletId, walletAddress, amount, leverage, isLong, entryPrice }
//   2. This route bridges USDC from user's Arc wallet → MarginVault on Eth Sepolia
//   3. Returns bridge result + position tracking info
//
// Prerequisites:
//   npm install @circle-fin/bridge-kit @circle-fin/adapter-circle-wallets

import { NextRequest, NextResponse } from 'next/server';
import { BridgeKit } from '@circle-fin/bridge-kit';
import type { BridgeResult } from '@circle-fin/bridge-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';

// ─── Config ──────────────────────────────────────────────────────────────
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY!;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;

// MarginVault address on Ethereum Sepolia (receives the bridged USDC)
const MARGIN_VAULT_ADDRESS = process.env.MARGIN_VAULT_ETH_SEPOLIA!;

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Extract tx hash from BridgeResult.steps by step name */
function getStepTxHash(result: BridgeResult, stepName: string): string | undefined {
  return result.steps.find(
    (s) => s.name.toLowerCase().includes(stepName.toLowerCase())
  )?.txHash;
}

// In-memory position tracking (swap for DB in production)
let nextPositionId = 0;
export const positions = new Map<number, {
  id: number;
  trader: string;
  walletId: string;
  amount: string;
  leverage: number;
  isLong: boolean;
  entryPrice: string;
  status: 'bridging' | 'active' | 'closing' | 'closed';
  bridgeResult?: {
    state: string;
    amount: string;
    approveTxHash?: string;
    burnTxHash?: string;
    mintTxHash?: string;
    steps: Array<{ name: string; state: string; txHash?: string; explorerUrl?: string }>;
  };
  openedAt: string;
}>();

// ─── POST /api/margin/deposit ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      walletId,        // Circle developer-controlled wallet ID (Arc)
      walletAddress,   // User's EVM address (same across chains)
      amount,          // USDC amount as string, e.g. "10.00"
      leverage,
      isLong,
      entryPrice,
    } = body;

    // Validate
    if (!walletId || !walletAddress || !amount || !leverage || !entryPrice) {
      return NextResponse.json(
        { error: 'Missing required fields: walletId, walletAddress, amount, leverage, entryPrice' },
        { status: 400 }
      );
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // ── Initialize Bridge Kit with Circle Wallets adapter ─────────────
    const kit = new BridgeKit();

    const adapter = createCircleWalletsAdapter({
      apiKey: CIRCLE_API_KEY,
      entitySecret: CIRCLE_ENTITY_SECRET,
    });

    console.log(`[margin/deposit] Bridging ${amount} USDC from Arc → Eth Sepolia`);
    console.log(`  Source address: ${walletAddress}`);
    console.log(`  Destination (MarginVault): ${MARGIN_VAULT_ADDRESS}`);

    // ── Create position record ─────────────────────────────────────────
    const positionId = nextPositionId++;
    positions.set(positionId, {
      id: positionId,
      trader: walletAddress,
      walletId,
      amount,
      leverage,
      isLong,
      entryPrice,
      status: 'bridging',
      openedAt: new Date().toISOString(),
    });

    // ── Execute Bridge Kit transfer ────────────────────────────────────
    //
    // Bridge Kit handles the full CCTP V2 flow:
    //   1. Approve USDC for TokenMessenger
    //   2. Burn (depositForBurn) on Arc
    //   3. Poll attestation API
    //   4. Mint (receiveMessage) on Eth Sepolia
    //
    // Developer-controlled adapters require `address` (not `walletAddress`).
    // `recipientAddress` on `to` overrides where minted USDC goes —
    //   sends to MarginVault instead of the user's own Eth Sepolia wallet.
    //
    const result: BridgeResult = await kit.bridge({
      from: {
        adapter,
        chain: 'Arc_Testnet',
        address: walletAddress,     // Source: user's wallet on Arc
      },
      to: {
        adapter,
        chain: 'Ethereum_Sepolia',
        address: walletAddress,                 // Adapter wallet on Eth Sepolia (same EVM addr)
        recipientAddress: MARGIN_VAULT_ADDRESS,  // Override mint recipient → MarginVault
      },
      amount: amount,
      token: 'USDC',
    });

    console.log('[margin/deposit] Bridge result:', JSON.stringify({
      state: result.state,
      amount: result.amount,
      steps: result.steps.map(s => ({ name: s.name, state: s.state, txHash: s.txHash })),
    }, null, 2));

    // ── Extract tx hashes from result.steps ───────────────────────────
    //
    // BridgeResult has no top-level tx hash fields.
    // Each step in result.steps has: { name, state, txHash?, explorerUrl? }
    // Step names are typically "Approve", "Burn", "Mint" (or similar).
    //
    const approveTxHash = getStepTxHash(result, 'approve');
    const burnTxHash = getStepTxHash(result, 'burn');
    const mintTxHash = getStepTxHash(result, 'mint');

    // ── Update position ───────────────────────────────────────────────
    const position = positions.get(positionId)!;
    position.status = result.state === 'success' ? 'active' : 'bridging';
    position.bridgeResult = {
      state: result.state,
      amount: result.amount,
      approveTxHash,
      burnTxHash,
      mintTxHash,
      steps: result.steps.map(s => ({
        name: s.name,
        state: s.state,
        txHash: s.txHash,
        explorerUrl: s.explorerUrl,
      })),
    };

    return NextResponse.json({
      success: result.state === 'success',
      positionId,
      bridge: {
        state: result.state,
        amount: result.amount,
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
      position: {
        id: positionId,
        amount,
        leverage,
        isLong,
        entryPrice,
        status: position.status,
      },
    });

  } catch (error: any) {
    console.error('[margin/deposit] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Bridge transfer failed' },
      { status: 500 }
    );
  }
}