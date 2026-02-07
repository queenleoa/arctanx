import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const GATEWAY_API = 'https://gateway-api-testnet.circle.com/v1';

// Domain IDs for Gateway
const DOMAINS: Record<string, number> = {
  'ARC-TESTNET': 26,
  'AVAX-FUJI': 1,
  'BASE-SEPOLIA': 6,
  'SOL-DEVNET': 5,
};

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { evmAddress, solanaAddress } = await request.json();

    if (!evmAddress) {
      return NextResponse.json({ error: 'Missing evmAddress' }, { status: 400 });
    }

    // Build sources array – EVM chains share one address, Solana has its own
    const sources: Array<{ domain: number; depositor: string }> = [
      { domain: DOMAINS['ARC-TESTNET'], depositor: evmAddress },
      { domain: DOMAINS['AVAX-FUJI'], depositor: evmAddress },
      { domain: DOMAINS['BASE-SEPOLIA'], depositor: evmAddress },
    ];

    if (solanaAddress) {
      sources.push({ domain: DOMAINS['SOL-DEVNET'], depositor: solanaAddress });
    }

    const res = await fetch(`${GATEWAY_API}/balances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'USDC', sources }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[gateway-balance] API error:', res.status, errText);
      return NextResponse.json({ error: 'Gateway API error' }, { status: res.status });
    }

    const data = await res.json();

    // Parse per-chain balances and compute total
    let totalUsdc = 0;
    const perChain: Record<string, string> = {};

    for (const b of data.balances ?? []) {
      const amount = parseFloat(b.balance || '0');
      totalUsdc += amount;

      // Map domain back to chain name
      const domain = b.source?.domain ?? b.domain;
      if (domain === DOMAINS['ARC-TESTNET']) perChain['arc'] = amount.toFixed(6);
      else if (domain === DOMAINS['AVAX-FUJI']) perChain['avax'] = amount.toFixed(6);
      else if (domain === DOMAINS['BASE-SEPOLIA']) perChain['base'] = amount.toFixed(6);
      else if (domain === DOMAINS['SOL-DEVNET']) perChain['solana'] = amount.toFixed(6);
    }

    return NextResponse.json({
      totalUsdc: totalUsdc.toFixed(6),
      perChain,
    });
  } catch (error: any) {
    console.error('[gateway-balance] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Gateway balance' },
      { status: 500 },
    );
  }
}