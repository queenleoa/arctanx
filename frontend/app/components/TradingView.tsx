'use client';

import { useState, useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

interface TradingViewProps {
  onBack: () => void;
  usdcBalance: number;
}

export function TradingView({ onBack, usdcBalance }: TradingViewProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any>(null);
  
  const [tradingTab, setTradingTab] = useState<'long' | 'short' | 'swap'>('long');
  const [leverage, setLeverage] = useState('1');
  const [collateralAmount, setCollateralAmount] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [timeframe, setTimeframe] = useState<'15' | '60' | '240' | 'D'>('15');
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState<'EURUSD'>('EURUSD');

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#334155',
      },
      grid: {
        vertLines: { color: '#e2e8f0' },
        horzLines: { color: '#e2e8f0' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // @ts-ignore - TypeScript may have issues with the chart API
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;

    console.log('Chart initialized');

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Fetch historical data
  useEffect(() => {
    const fetchHistoricalData = async () => {
      // Wait a bit to ensure chart is ready
      if (!candlestickSeriesRef.current) {
        console.log('Chart series not ready yet, waiting...');
        setTimeout(() => {
          if (candlestickSeriesRef.current) {
            fetchHistoricalData();
          }
        }, 100);
        return;
      }

      setLoading(true);
      try {
        // Get current time in seconds
        const now = Math.floor(Date.now() / 1000);
        console.log('Current timestamp:', now, 'Date:', new Date(now * 1000).toISOString());
        
        let secondsAgo;
        
        // Calculate time range based on timeframe
        // Use longer ranges to ensure we get data
        switch(timeframe) {
          case '15':
            secondsAgo = 86400 * 7; // 7 days for 15min candles
            break;
          case '60':
            secondsAgo = 86400 * 14; // 14 days for 1h candles
            break;
          case '240':
            secondsAgo = 86400 * 30; // 30 days for 4h candles
            break;
          case 'D':
            secondsAgo = 86400 * 90; // 90 days for daily candles
            break;
          default:
            secondsAgo = 86400 * 7;
        }
        
        const from = now - secondsAgo;

        console.log('Fetching historical data:', { 
          timeframe, 
          from, 
          to: now,
          fromDate: new Date(from * 1000).toISOString(),
          toDate: new Date(now * 1000).toISOString(),
          range: `${secondsAgo / 86400} days`
        });

        const response = await fetch(
          `/api/stork/history?symbol=EURUSD&resolution=${timeframe}&from=${from}&to=${now}`
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API error response:', errorText);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        console.log('Received data:', result);
        
        if (result.data && candlestickSeriesRef.current) {
          const { t, o, h, l, c } = result.data;
          
          if (!t || !o || !h || !l || !c) {
            console.error('Missing data fields:', { 
              hasT: !!t, 
              hasO: !!o, 
              hasH: !!h, 
              hasL: !!l, 
              hasC: !!c,
              result 
            });
            return;
          }

          if (t.length === 0) {
            console.warn('No data points received - Stork might not have data for this time range or symbol');
            console.warn('Try checking available assets at: /api/stork/assets');
            return;
          }
          
          const candlestickData = t.map((time: number, i: number) => ({
            time: time, // Stork returns Unix timestamp in seconds
            open: parseFloat(o[i]),
            high: parseFloat(h[i]),
            low: parseFloat(l[i]),
            close: parseFloat(c[i]),
          }));

          console.log('Formatted candlestick data (first 3):', candlestickData.slice(0, 3));
          console.log('Formatted candlestick data (last 3):', candlestickData.slice(-3));
          console.log('Total data points:', candlestickData.length);

          candlestickSeriesRef.current.setData(candlestickData);
          
          // Set current price from latest candle
          if (c.length > 0) {
            const latestPrice = parseFloat(c[c.length - 1]);
            console.log('Setting current price from chart:', latestPrice);
            setCurrentPrice(latestPrice);
          }

          // Fit content to make sure chart is visible
          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
          }
        } else {
          console.error('Invalid data structure or series not ready', {
            hasData: !!result.data,
            hasSeries: !!candlestickSeriesRef.current,
            resultKeys: result ? Object.keys(result) : 'no result'
          });
        }
      } catch (error) {
        console.error('Error fetching historical data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistoricalData();
  }, [timeframe]); // Re-fetch when timeframe changes

  // Update current price periodically
  useEffect(() => {
    const fetchLatestPrice = async () => {
      try {
        const response = await fetch('/api/stork/latest?assets=EURUSD');
        const result = await response.json();
        
        if (result.data && result.data.EURUSD) {
          const price = parseFloat(result.data.EURUSD.price) / 1e18; // Stork uses 18 decimals
          setCurrentPrice(price);
        }
      } catch (error) {
        console.error('Error fetching latest price:', error);
      }
    };

    const interval = setInterval(fetchLatestPrice, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleTrade = () => {
    if (!collateralAmount || parseFloat(collateralAmount) <= 0) {
      alert('Please enter a valid collateral amount');
      return;
    }

    if (parseFloat(collateralAmount) > usdcBalance) {
      alert('Insufficient USDC balance');
      return;
    }

    const notionalSize = parseFloat(collateralAmount) * parseFloat(leverage);
    
    const newPosition = {
      id: Date.now(),
      type: tradingTab,
      size: notionalSize,
      collateral: parseFloat(collateralAmount),
      leverage: parseFloat(leverage),
      entryPrice: currentPrice,
      timestamp: new Date().toISOString(),
    };

    setPositions([...positions, newPosition]);
    setCollateralAmount('');
    alert(`${tradingTab.toUpperCase()} position opened!`);
  };

  const closePosition = (positionId: number) => {
    setPositions(positions.filter(p => p.id !== positionId));
    alert('Position closed!');
  };

  const notionalSize = collateralAmount && leverage 
    ? (parseFloat(collateralAmount) * parseFloat(leverage)).toFixed(2)
    : '0.00';

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">EUR/USD Perpetual</h1>
            <p className="text-sm text-slate-600 mt-1">
              Live Price: {currentPrice ? `$${currentPrice.toFixed(6)}` : 'Loading...'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/api/stork/assets"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              View Available Assets
            </a>
            <button
              onClick={onBack}
              className="px-6 py-2 bg-slate-200 text-slate-900 font-semibold rounded-lg hover:bg-slate-300 transition"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-3 gap-6">
          {/* Left Side - Chart & Positions */}
          <div className="col-span-2 space-y-6">
            {/* Chart */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">EUR/USD Chart</h2>
                <div className="flex gap-2 text-sm">
                  <button
                    onClick={() => setTimeframe('15')}
                    className={`px-3 py-1 rounded transition ${
                      timeframe === '15'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    15m
                  </button>
                  <button
                    onClick={() => setTimeframe('60')}
                    className={`px-3 py-1 rounded transition ${
                      timeframe === '60'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    1h
                  </button>
                  <button
                    onClick={() => setTimeframe('240')}
                    className={`px-3 py-1 rounded transition ${
                      timeframe === '240'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    4h
                  </button>
                  <button
                    onClick={() => setTimeframe('D')}
                    className={`px-3 py-1 rounded transition ${
                      timeframe === 'D'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    1D
                  </button>
                </div>
              </div>
              {loading && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-xl">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto mb-2"></div>
                    <p className="text-sm text-slate-600">Loading chart...</p>
                  </div>
                </div>
              )}
              <div ref={chartContainerRef} className="min-h-[500px]" />
            </div>

            {/* Positions */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Open Positions</h2>
              
              {positions.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-sm">No open positions</p>
                  <p className="text-xs mt-2">Open a position to get started</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Type</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Size</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Collateral</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Leverage</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Entry</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">PnL</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((position) => {
                        const pnl = currentPrice && position.entryPrice
                          ? ((currentPrice - position.entryPrice) / position.entryPrice) * 
                            position.size * 
                            (position.type === 'long' ? 1 : -1)
                          : 0;
                        const pnlPercent = position.collateral 
                          ? (pnl / position.collateral) * 100 
                          : 0;

                        return (
                          <tr key={position.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                position.type === 'long' 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {position.type.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-900">${position.size.toFixed(2)}</td>
                            <td className="py-3 px-4 text-sm text-slate-900">${position.collateral.toFixed(2)}</td>
                            <td className="py-3 px-4 text-sm text-slate-900">{position.leverage}x</td>
                            <td className="py-3 px-4 text-sm text-slate-900">${position.entryPrice.toFixed(6)}</td>
                            <td className="py-3 px-4">
                              <div className={`text-sm font-semibold ${pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                ${pnl.toFixed(2)}
                                <span className="text-xs ml-1">({pnlPercent.toFixed(2)}%)</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => closePosition(position.id)}
                                className="px-3 py-1 text-xs bg-slate-900 text-white rounded hover:bg-slate-800 transition"
                              >
                                Close
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right Side - Trading Panel */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Trade EUR/USD</h2>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setTradingTab('long')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition ${
                  tradingTab === 'long'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                Long
              </button>
              <button
                onClick={() => setTradingTab('short')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition ${
                  tradingTab === 'short'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                Short
              </button>
              <button
                onClick={() => setTradingTab('swap')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition ${
                  tradingTab === 'swap'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                Swap
              </button>
            </div>

            {/* Trading Form */}
            <div className="space-y-6">
              {/* Balance Display */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-600 mb-1">Available Balance</p>
                <p className="text-2xl font-bold text-slate-900">${usdcBalance.toFixed(2)}</p>
                <p className="text-xs text-slate-500 mt-1">USDC</p>
              </div>

              {/* Collateral Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Collateral Amount (USDC)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={usdcBalance}
                  value={collateralAmount}
                  onChange={(e) => setCollateralAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-lg font-semibold"
                />
                <button
                  onClick={() => setCollateralAmount(usdcBalance.toString())}
                  className="mt-2 text-xs text-slate-600 hover:text-slate-900 font-medium"
                >
                  Use Max
                </button>
              </div>

              {/* Leverage */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Leverage
                </label>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {['1', '2', '5', '10', '20'].map((lev) => (
                    <button
                      key={lev}
                      onClick={() => setLeverage(lev)}
                      className={`py-2 px-3 rounded-lg text-sm font-semibold transition ${
                        leverage === lev
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {lev}x
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                />
              </div>

              {/* Trade Summary */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Notional Size</span>
                  <span className="font-semibold text-slate-900">${notionalSize}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Entry Price</span>
                  <span className="font-semibold text-slate-900">
                    {currentPrice ? `$${currentPrice.toFixed(6)}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Type</span>
                  <span className="font-semibold text-slate-900">Market Order</span>
                </div>
              </div>

              {/* Execute Button */}
              <button
                onClick={handleTrade}
                disabled={!collateralAmount || !currentPrice}
                className={`w-full py-4 rounded-lg font-semibold text-white text-lg transition ${
                  tradingTab === 'long'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : tradingTab === 'short'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {tradingTab === 'swap' 
                  ? 'Execute Swap' 
                  : `Open ${tradingTab.charAt(0).toUpperCase() + tradingTab.slice(1)} Position`}
              </button>

              <p className="text-xs text-slate-500 text-center">
                This is a demo trading interface. No real funds are at risk.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}