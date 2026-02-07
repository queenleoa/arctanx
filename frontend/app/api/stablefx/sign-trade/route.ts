import { NextResponse } from 'next/server';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const STABLEFX_API_KEY = process.env.STABLEFX_API_KEY!;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY!;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;

interface SignTradeRequestBody {
  walletId: string;
  tradeId: string;
  walletAddress: string;
  quoteId: string; // We still need this but won't use it in details
}

export async function POST(request: Request) {
  try {
    const { walletId, tradeId, walletAddress, quoteId }: SignTradeRequestBody = await request.json();

    console.log('[sign-trade] Starting trade signing', { walletId, tradeId, walletAddress, quoteId });

    const circleClient = initiateDeveloperControlledWalletsClient({
      apiKey: CIRCLE_API_KEY,
      entitySecret: CIRCLE_ENTITY_SECRET,
    });

    // Get presign data from StableFX
    console.log('[sign-trade] Fetching presign data');
    const presignResponse = await fetch(
      `https://api.circle.com/v1/exchange/stablefx/signatures/presign/taker/${tradeId}?recipientAddress=${walletAddress}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${STABLEFX_API_KEY}`,
          Accept: 'application/json',
        },
      }
    );

    if (!presignResponse.ok) {
      const errorText = await presignResponse.text();
      throw new Error(`Presign failed: ${presignResponse.status} - ${errorText}`);
    }

    const presignData = await presignResponse.json();
    const presignPayload = presignData.data || presignData;
    
    if (!presignPayload.typedData) {
      throw new Error('No typedData in presign response');
    }

    console.log('[sign-trade] Received Permit2 typed data');

    const typedDataToSign = presignPayload.typedData;

    // Sign with Circle SDK
    console.log('[sign-trade] Signing Permit2 authorization with Circle SDK');
    const signResult = await circleClient.signTypedData({
      walletId: walletId,
      data: JSON.stringify(typedDataToSign),
    });

    if (!signResult.data?.signature) {
      throw new Error('No signature returned from Circle SDK');
    }

    const signature = signResult.data.signature;
    console.log('[sign-trade] Signed:', signature.slice(0, 20) + '...');

    // Use the message EXACTLY as returned from presign - don't modify anything!
    // The signature was created for this exact structure
    const details = typedDataToSign.message;

    console.log('[sign-trade] Submitting signature');

    // Submit signature to StableFX
    const submitResponse = await fetch(
      `https://api.circle.com/v1/exchange/stablefx/signatures`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STABLEFX_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          tradeId,
          type: 'taker',
          address: walletAddress,
          details: details, // Pass the message exactly as-is
          signature,
        }),
      }
    );

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(`Submit failed: ${submitResponse.status} - ${errorText}`);
    }

    console.log('[sign-trade] Signature submitted successfully');

    // Poll for confirmation
    console.log('[sign-trade] Polling for confirmation');
    let confirmed = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!confirmed && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000));
      attempts++;

      const statusResp = await fetch(
        `https://api.circle.com/v1/exchange/stablefx/trades/${tradeId}`,
        { 
          headers: { 
            Authorization: `Bearer ${STABLEFX_API_KEY}`,
            Accept: 'application/json',
          } 
        }
      );

      if (statusResp.ok) {
        const statusResult = await statusResp.json();
        const statusData = statusResult.data || statusResult;
        
        console.log(`[sign-trade] Trade status: ${statusData.status}`);
        
        if (['pending_settlement', 'settled', 'complete'].includes(statusData.status)) {
          confirmed = true;
          console.log(`[sign-trade] Confirmed: ${statusData.status}`);
        }
      }
    }

    if (!confirmed) {
      console.log('[sign-trade] Warning: Trade not confirmed after 30 seconds');
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