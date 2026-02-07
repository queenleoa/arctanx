import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const STABLEFX_API_URL = 'https://api.circle.com/v1/exchange/stablefx';

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tradeId = searchParams.get('tradeId');

    if (!tradeId) {
      return NextResponse.json({ error: 'Missing tradeId' }, { status: 400 });
    }

    console.log(`[stablefx-get-trade] Fetching trade: ${tradeId}`);

    const response = await fetch(`${STABLEFX_API_URL}/trades/${tradeId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.STABLEFX_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    const responseText = await response.text();
    console.log('[stablefx-get-trade] Response status:', response.status);
    console.log('[stablefx-get-trade] Response body:', responseText);

    if (!response.ok) {
      const errorData = responseText ? JSON.parse(responseText) : {};
      return NextResponse.json(
        { error: errorData.message || `StableFX API error: ${response.status}` },
        { status: response.status }
      );
    }

    const responseData = JSON.parse(responseText);

    // Extract trade from data wrapper
    const trade = responseData.data || responseData;

    return NextResponse.json({ trade });
  } catch (error: any) {
    console.error('[stablefx-get-trade] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get trade' },
      { status: 500 }
    );
  }
}