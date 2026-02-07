import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'EURUSD';
    const resolution = searchParams.get('resolution') || '15'; // 15 minutes default
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    
    console.log('History API called with:', { symbol, resolution, from, to });
    
    if (!from || !to) {
      return NextResponse.json(
        { error: 'Missing from or to timestamp' },
        { status: 400 }
      );
    }
    
    const url = `https://rest.jp.stork-oracle.network/v1/tradingview/history?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}`;
    console.log('Fetching from Stork:', url);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${process.env.STORK_API_KEY}`,
      },
    });
    
    console.log('Stork response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Stork API error:', errorText);
      throw new Error('Failed to fetch historical data from Stork');
    }
    
    const data = await response.json();
    console.log('Stork data received, data points:', data?.data?.t?.length || 0);
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Stork API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}