'use client';

import { useState, useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { StableFXSwap } from './StableFXSwap';

interface TradingViewProps {
  onBack: () => void;
  usdcBalance: number;
  eurcBalance: number;
  walletAddress: string;
  arcWalletId: string;
  onRefreshBalances: () => void;
}

export function TradingView({ 
  onBack, 
  usdcBalance, 
  eurcBalance, 
  walletAddress, 
  arcWalletId,
  onRefreshBalances 
}: TradingViewProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const lineSeriesRef = useRef<any>(null);
  
  const [tradingTab, setTradingTab] = useState<'long' | 'short' | 'swap'>('swap');
  const [leverage, setLeverage] = useState('1');
  const [collateralAmount, setCollateralAmount] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        secondsVisible: true,
      },
    });

    const lineSeries = chart.addLineSeries({
      color: '#2563eb',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 6,
        minMove: 0.000001,
      },
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;

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

  // Fetch recent price data
  const fetchRecentPrices = async () => {
    if (!lineSeriesRef.current) return;

    try {
      const response = await fetch('/api/stork/recent?assets=EURUSD');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        const chartData = result.data
          .map((item: any) => ({
            time: item.timestamp,
            value: parseFloat(item.price) / 1e18,
          }))
          .sort((a: any, b: any) => a.time - b.time);

        lineSeriesRef.current.setData(chartData);
        
        if (chartData.length > 0) {
          const latestPrice = chartData[chartData.length - 1].value;
          setCurrentPrice(latestPrice);
        }

        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }

        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching recent prices:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentPrices();
    const chartInterval = setInterval(fetchRecentPrices, 10000);
    return () => clearInterval(chartInterval);
  }, []);

  // Update current price more frequently
  useEffect(() => {
    const fetchLatestPrice = async () => {
      try {
        const response = await fetch('/api/stork/latest?assets=EURUSD');
        const result = await response.json();
        
        if (result.data && result.data.EURUSD) {
          const price = parseFloat(result.data.EURUSD.price) / 1e18;
          setCurrentPrice(price);
        }
      } catch (error) {
        console.error('Error fetching latest price:', error);
      }
    };

    const priceInterval = setInterval(fetchLatestPrice, 5000);
    return () => clearInterval(priceInterval);
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
            <h1 className="text-2xl font-bold text-slate-900">EUR/USD Trading</h1>
            <h2 className="text-xl text-slate-800 mt-1">
              Live Price: <b>{currentPrice ? `$${currentPrice.toFixed(6)}` : 'Loading...'}</b>
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-emerald-700">Live Data</span>
            </div>
            <button
              onClick={onBack}
              className="px-6 py-2 bg-slate-200 text-slate-900 font-semibold rounded-lg hover:bg-slate-300 transition"
            >
              ← Back to Wallet
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
                <h2 className="text-lg font-semibold text-slate-900">EUR/USD Live Chart</h2>
                <div className="text-sm text-slate-600">
                  Real-time data via Stork Oracle
                </div>
              </div>
              {loading && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-xl">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto mb-2"></div>
                    <p className="text-sm text-slate-600">Loading live prices...</p>
                  </div>
                </div>
              )}
              <div ref={chartContainerRef} className="min-h-[500px]" />
              <p className="text-xs text-slate-500 mt-2 text-center">
                Forex Markets are closed on weekends. It is normal to see no forex index fluctuation on weekends. 
              </p>
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
          <div className="space-y-6">
            {/* Tabs */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setTradingTab('swap')}
                  className={`flex-1 py-3 px-4 text-sm font-semibold ${
                    tradingTab === 'swap'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Spot Swap (StableFX)
                </button>
                <button
                  onClick={() => setTradingTab('long')}
                  className={`flex-1 py-3 px-4 text-sm font-semibold ${
                    tradingTab === 'long'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Long
                </button>
                <button
                  onClick={() => setTradingTab('short')}
                  className={`flex-1 py-3 px-4 text-sm font-semibold ${
                    tradingTab === 'short'
                      ? 'bg-red-600 text-white'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Short
                </button>
              </div>

              <div className="p-6">
                {/* StableFX Swap Tab */}
                {tradingTab === 'swap' && (
                  <StableFXSwap
                    walletAddress={walletAddress}
                    arcWalletId={arcWalletId}
                    usdcBalance={usdcBalance}
                    eurcBalance={eurcBalance}
                    onRefreshBalances={onRefreshBalances}
                  />
                )}

                {/* Long/Short Tabs - Demo perpetuals trading */}
                {(tradingTab === 'long' || tradingTab === 'short') && (
                  <div className="space-y-6">
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                      <p className="text-sm text-amber-900">
                        <strong>Demo Mode:</strong> Perpetual futures trading is currently in demo mode. Use StableFX for real spot conversions.
                      </p>
                    </div>

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
                          : 'bg-red-600 hover:bg-red-700'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      Open {tradingTab.charAt(0).toUpperCase() + tradingTab.slice(1)} Position
                    </button>

                    <p className="text-xs text-slate-500 text-center">
                      Demo trading interface. No real funds are at risk.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}