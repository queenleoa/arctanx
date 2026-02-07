import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { randomUUID } from 'crypto';

const STABLEFX_API_URL = 'https://api.circle.com/v1/exchange/stablefx';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quoteId } = await request.json();

    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 });
    }

    console.log(`[stablefx-create-trade] Creating trade for quote: ${quoteId}`);

    const response = await fetch(`${STABLEFX_API_URL}/trades`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STABLEFX_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        quoteId,
      }),
    });

    const responseText = await response.text();
    console.log('[stablefx-create-trade] Response status:', response.status);
    console.log('[stablefx-create-trade] Response body:', responseText);

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
    console.error('[stablefx-create-trade] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create trade' },
      { status: 500 }
    );
  }
}