import { NextResponse } from 'next/server';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const STABLEFX_API_KEY = process.env.STABLEFX_API_KEY!;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY!;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;

interface FundTradeRequestBody {
  walletId: string;
  tradeId: string;
}

export async function POST(request: Request) {
  try {
    const { walletId, tradeId }: FundTradeRequestBody = await request.json();

    console.log('[fund-trade] Starting trade funding', { walletId, tradeId });

    // Initialize Circle SDK - it handles entitySecretCiphertext internally
    const circleClient = initiateDeveloperControlledWalletsClient({
      apiKey: CIRCLE_API_KEY,
      entitySecret: CIRCLE_ENTITY_SECRET,
    });

    // Get funding presign data from StableFX
    console.log('[fund-trade] Fetching funding presign data');
    const presignResponse = await fetch(
      `https://api.stablefx.circle.com/v1/trades/${tradeId}/funding/presign`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STABLEFX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!presignResponse.ok) {
      throw new Error(`Funding presign failed: ${presignResponse.status}`);
    }

    const presignData = await presignResponse.json();

    // Sign the Permit2 EIP-712 data
    console.log('[fund-trade] Signing Permit2 authorization');
    const signResult = await circleClient.signTypedData({
      walletId: walletId,
      data: JSON.stringify(presignData.Permit2), // Must be stringified
    });

    // ✅ Proper null checking - data is optional in SDK response
    if (!signResult.data?.signature) {
      throw new Error('No signature returned from Circle SDK');
    }

    const signature = signResult.data.signature;
    console.log('[fund-trade] Signed:', signature.slice(0, 20) + '...');

    // Submit funding with signature to StableFX
    console.log('[fund-trade] Submitting funding');
    const fundingResponse = await fetch(
      `https://api.stablefx.circle.com/v1/trades/${tradeId}/funding`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STABLEFX_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ signature }),
      }
    );

    if (!fundingResponse.ok) {
      throw new Error(`Funding submission failed: ${fundingResponse.status}`);
    }

    // Poll for completion
    let complete = false;
    let attempts = 0;
    const maxAttempts = 60; // Longer timeout for blockchain confirmation

    while (!complete && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000));
      attempts++;

      const statusResp = await fetch(
        `https://api.stablefx.circle.com/v1/trades/${tradeId}`,
        { headers: { Authorization: `Bearer ${STABLEFX_API_KEY}` } }
      );

      if (statusResp.ok) {
        const statusData = await statusResp.json();
        if (statusData.status === 'complete') {
          complete = true;
          console.log('[fund-trade] Trade completed successfully');
        }
      }
    }

    return NextResponse.json({
      success: true,
      tradeId,
      signature,
      complete,
    });

  } catch (error: any) {
    console.error('[fund-trade] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}