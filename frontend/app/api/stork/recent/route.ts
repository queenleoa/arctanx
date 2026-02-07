import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const assets = searchParams.get('assets') || 'EURUSD';
    
    console.log('Fetching recent prices for', assets);
    
    // CRITICAL FIX: Get the REAL current timestamp from Stork's latest endpoint
    let now: number;
    try {
      const latestResponse = await fetch(
        `https://rest.jp.stork-oracle.network/v1/prices/latest?assets=${assets}`,
        {
          headers: {
            'Authorization': `Basic ${process.env.STORK_API_KEY}`,
          },
        }
      );
      
      if (!latestResponse.ok) {
        throw new Error('Failed to get latest timestamp from Stork');
      }
      
      const latestData = await latestResponse.json();
      
      if (latestData.data && latestData.data[assets] && latestData.data[assets].timestamp) {
        // Stork timestamp is in nanoseconds, convert to seconds
        now = Math.floor(latestData.data[assets].timestamp / 1000000000);
        console.log('Using REAL timestamp from Stork:', now, 'Date:', new Date(now * 1000).toISOString());
      } else {
        throw new Error('Invalid response from Stork latest endpoint');
      }
    } catch (e) {
      console.error('Failed to get real timestamp from Stork:', e);
      // Fallback to system time (will likely fail but worth trying)
      now = Math.floor(Date.now() / 1000);
      console.warn('Using system time as fallback:', now);
    }
    
    const results = [];
    
    // Get prices at 30-second intervals over the last 10 minutes
    for (let i = 0; i < 20; i++) {
      const timestamp = now - (i * 30); // Every 30 seconds
      
      try {
        const response = await fetch(
          `https://rest.jp.stork-oracle.network/v1/prices/recent?timestamp=${timestamp}&assets=${assets}`,
          {
            headers: {
              'Authorization': `Basic ${process.env.STORK_API_KEY}`,
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.data && data.data[assets]) {
            results.push({
              timestamp,
              price: data.data[assets].price,
              timestampNs: data.data[assets].timestamp,
            });
          }
        }
      } catch (e) {
        console.error(`Error fetching price at timestamp ${timestamp}:`, e);
      }
    }
    
    console.log('Fetched', results.length, 'recent price points');
    
    return NextResponse.json({ data: results });
  } catch (error: any) {
    console.error('Stork API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch recent prices' },
      { status: 500 }
    );
  }
}