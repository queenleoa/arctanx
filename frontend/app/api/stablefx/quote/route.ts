import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const STABLEFX_API_URL = 'https://api.circle.com/v1/exchange/stablefx';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fromCurrency, toCurrency, amount } = await request.json();

    if (!fromCurrency || !toCurrency || !amount) {
      return NextResponse.json(
        { error: 'Missing fromCurrency, toCurrency, or amount' },
        { status: 400 }
      );
    }

    console.log(`[stablefx-quote] Requesting quote: ${amount} ${fromCurrency} → ${toCurrency}`);

    const response = await fetch(`${STABLEFX_API_URL}/quotes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STABLEFX_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        from: {
          currency: fromCurrency,
          amount: amount.toString(),
        },
        to: {
          currency: toCurrency,
        },
        tenor: 'instant',
      }),
    });

    const responseText = await response.text();
    console.log('[stablefx-quote] Response status:', response.status);
    console.log('[stablefx-quote] Response body:', responseText);

    if (!response.ok) {
      const errorData = responseText ? JSON.parse(responseText) : {};
      return NextResponse.json(
        { error: errorData.message || `StableFX API error: ${response.status}` },
        { status: response.status }
      );
    }

    const responseData = JSON.parse(responseText);

    // Extract quote from data wrapper
    const quote = responseData.data || responseData;

    return NextResponse.json({ quote });
  } catch (error: any) {
    console.error('[stablefx-quote] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get quote' },
      { status: 500 }
    );
  }
}