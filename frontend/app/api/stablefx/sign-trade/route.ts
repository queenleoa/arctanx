import { NextResponse } from 'next/server';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const STABLEFX_API_KEY = process.env.STABLEFX_API_KEY!;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY!;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;

interface SignTradeRequestBody {
  walletId: string;
  tradeId: string;
}

export async function POST(request: Request) {
  try {
    const { walletId, tradeId }: SignTradeRequestBody = await request.json();

    console.log('[sign-trade] Starting trade signing', { walletId, tradeId });

    // Initialize Circle SDK - it handles entitySecretCiphertext internally
    const circleClient = initiateDeveloperControlledWalletsClient({
      apiKey: CIRCLE_API_KEY,
      entitySecret: CIRCLE_ENTITY_SECRET,
    });

    // Get presign data from StableFX
    console.log('[sign-trade] Fetching presign data');
    const presignResponse = await fetch(
      `https://api.stablefx.circle.com/v1/trades/${tradeId}/presign`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STABLEFX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!presignResponse.ok) {
      throw new Error(`Presign failed: ${presignResponse.status}`);
    }

    const presignData = await presignResponse.json();

    // Sign the TakerDetails EIP-712 data
    console.log('[sign-trade] Signing with Circle SDK');
    const signResult = await circleClient.signTypedData({
      walletId: walletId,
      data: JSON.stringify(presignData.TakerDetails), // Must be stringified
    });

    // ✅ Proper null checking - data is optional in SDK response
    if (!signResult.data?.signature) {
      throw new Error('No signature returned from Circle SDK');
    }

    const signature = signResult.data.signature;
    console.log('[sign-trade] Signed:', signature.slice(0, 20) + '...');

    // Submit signature to StableFX
    console.log('[sign-trade] Submitting signature');
    const submitResponse = await fetch(
      `https://api.stablefx.circle.com/v1/trades/${tradeId}/sign`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STABLEFX_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ signature }),
      }
    );

    if (!submitResponse.ok) {
      throw new Error(`Submit failed: ${submitResponse.status}`);
    }

    // Poll for confirmation
    let confirmed = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!confirmed && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000));
      attempts++;

      const statusResp = await fetch(
        `https://api.stablefx.circle.com/v1/trades/${tradeId}`,
        { headers: { Authorization: `Bearer ${STABLEFX_API_KEY}` } }
      );

      if (statusResp.ok) {
        const statusData = await statusResp.json();
        if (['signed', 'funded', 'complete'].includes(statusData.status)) {
          confirmed = true;
          console.log(`[sign-trade] Confirmed: ${statusData.status}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      tradeId,
      signature,
      confirmed,
    });

  } catch (error: any) {
    console.error('[sign-trade] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}