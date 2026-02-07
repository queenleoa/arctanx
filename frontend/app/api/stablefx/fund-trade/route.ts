import { NextResponse } from 'next/server';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const STABLEFX_API_KEY = process.env.STABLEFX_API_KEY!; // ✅ Use StableFX key for API calls
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY!; // ✅ Use Circle key for SDK
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;

interface FundTradeRequestBody {
  walletId: string;
  tradeId: string;
  contractTradeId: string;
}

export async function POST(request: Request) {
  try {
    const { walletId, tradeId, contractTradeId }: FundTradeRequestBody = await request.json();

    console.log('[fund-trade] Starting trade funding', { walletId, tradeId, contractTradeId });

    const circleClient = initiateDeveloperControlledWalletsClient({
      apiKey: CIRCLE_API_KEY,
      entitySecret: CIRCLE_ENTITY_SECRET,
    });

    // ✅ Use STABLEFX_API_KEY for StableFX API endpoints
    console.log('[fund-trade] Fetching funding presign data');
    const presignResponse = await fetch(
      `https://api.circle.com/v1/exchange/stablefx/signatures/funding/presign`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STABLEFX_API_KEY}`, // ✅ StableFX API key
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          contractTradeIds: [contractTradeId],
          type: 'taker',
        }),
      }
    );

    if (!presignResponse.ok) {
      const errorText = await presignResponse.text();
      throw new Error(`Funding presign failed: ${presignResponse.status} - ${errorText}`);
    }

    const presignData = await presignResponse.json();
    
    // Handle both response formats: with or without 'data' wrapper
    const presignPayload = presignData.data || presignData;
    
    if (!presignPayload.typedData) {
      throw new Error('No typedData in presign response');
    }
    
    console.log('[fund-trade] Presign data received');

    // Sign with Circle SDK
    console.log('[fund-trade] Signing Permit2 authorization');
    const signResult = await circleClient.signTypedData({
      walletId: walletId,
      data: JSON.stringify(presignPayload.typedData),
    });

    if (!signResult.data?.signature) {
      throw new Error('No signature returned from Circle SDK');
    }

    const signature = signResult.data.signature;
    console.log('[fund-trade] Signed:', signature.slice(0, 20) + '...');

    // ✅ Use STABLEFX_API_KEY for funding submission
    console.log('[fund-trade] Submitting funding');
    const fundingResponse = await fetch(
      `https://api.circle.com/v1/exchange/stablefx/fund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STABLEFX_API_KEY}`, // ✅ StableFX API key
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          type: 'taker',
          signature,
          permit2: presignPayload.typedData.message,
        }),
      }
    );

    if (!fundingResponse.ok) {
      const errorText = await fundingResponse.text();
      throw new Error(`Funding submission failed: ${fundingResponse.status} - ${errorText}`);
    }

    // ✅ Use STABLEFX_API_KEY for status checks
    console.log('[fund-trade] Polling for completion');
    let complete = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!complete && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000));
      attempts++;

      const statusResp = await fetch(
        `https://api.circle.com/v1/exchange/stablefx/trades/${tradeId}`,
        { 
          headers: { 
            Authorization: `Bearer ${STABLEFX_API_KEY}`, // ✅ StableFX API key
            Accept: 'application/json',
          } 
        }
      );

      if (statusResp.ok) {
        const statusResult = await statusResp.json();
        const statusData = statusResult.data || statusResult;
        
        console.log(`[fund-trade] Trade status: ${statusData.status}`);
        
        if (statusData.status === 'complete' || statusData.status === 'settled') {
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