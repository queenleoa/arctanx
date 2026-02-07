import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { address, blockchain } = await request.json();
    
    if (!address || !blockchain) {
      return NextResponse.json({ error: 'Missing address or blockchain' }, { status: 400 });
    }

    // Determine which tokens to fund based on blockchain
    // Arc Testnet: native currency IS USDC, so only request native + EURC
    // Avax Fuji: request all three (native AVAX, USDC, EURC)
    // Base Sepolia: request all three (native ETH, USDC, EURC)
    // Solana Devnet: request all three (native SOL, USDC, EURC)
    const fundingConfig: Record<string, { native: boolean; usdc: boolean; eurc: boolean }> = {
      'ARC-TESTNET': { native: false, usdc: true, eurc: true }, // native IS USDC
      'AVAX-FUJI': { native: true, usdc: true, eurc: true },
      'BASE-SEPOLIA': { native: true, usdc: true, eurc: true },
      'SOL-DEVNET': { native: true, usdc: true, eurc: true },
    };
    
    const config = fundingConfig[blockchain];
    
    if (!config) {
      return NextResponse.json({ error: 'Unsupported blockchain' }, { status: 400 });
    }

    const response = await fetch('https://api.circle.com/v1/faucet/drips', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CIRCLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address,
        blockchain,
        ...config,
      }),
    });
    
    const responseText = await response.text();
    const data = responseText ? JSON.parse(responseText) : {};
    
    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || 'Faucet request failed', details: data },
        { status: response.status }
      );
    }
    
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Faucet API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to request faucet funds' },
      { status: 500 }
    );
  }
}