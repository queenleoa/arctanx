import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const assets = searchParams.get('assets') || 'EURUSD';
    
    const response = await fetch(
      `https://rest.jp.stork-oracle.network/v1/prices/latest?assets=${assets}`,
      {
        headers: {
          'Authorization': `Basic ${process.env.STORK_API_KEY}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch price from Stork');
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Stork API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch price' },
      { status: 500 }
    );
  }
}