import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createPublicClient, http } from 'viem';

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USDC', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://arc-testnet.drpc.org'] } },
} as const;

const TOKEN_ADDRESSES = {
  USDC: '0x3600000000000000000000000000000000000000',
  EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
};

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const ERC20_ABI = [
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
] as const;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { walletAddress, currency } = await request.json();

    if (!walletAddress || !currency) {
      return NextResponse.json(
        { error: 'Missing walletAddress or currency' },
        { status: 400 }
      );
    }

    const tokenAddress = TOKEN_ADDRESSES[currency as 'USDC' | 'EURC'];
    if (!tokenAddress) {
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
    }

    const client = createPublicClient({
      chain: arcTestnet,
      transport: http(),
    });

    // Check allowance for Permit2 - cast to bigint explicitly
    const allowanceResult = await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [walletAddress as `0x${string}`, PERMIT2_ADDRESS as `0x${string}`],
    });

    const allowance = BigInt(allowanceResult as string | number | bigint);

    // Consider it approved if allowance > 0
    const hasAllowance = allowance > BigInt(0);

    return NextResponse.json({
      hasAllowance,
      allowance: allowance.toString(),
    });
  } catch (error: any) {
    console.error('[check-permit2-allowance] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check Permit2 allowance' },
      { status: 500 }
    );
  }
}