'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { createPublicClient, http, formatUnits } from 'viem';
import { StableFXSwap } from './StableFXSwap';

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USDC', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://arc-testnet.drpc.org'] } },
} as const;

const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';

const ERC20_ABI = [{
  constant: true,
  inputs: [{ name: '_owner', type: 'address' }],
  name: 'balanceOf',
  outputs: [{ name: 'balance', type: 'uint256' }],
  type: 'function',
}] as const;

interface TradingViewProps {
  onBack: () => void;
  arcUsdcBalance: number;
  arcEurcBalance: number;
  gatewayUsdcBalance: number;
  gatewayPerChain: Record<string, string>;
  walletAddress: string;
  arcWalletId: string;
  solanaAddress: string;
  onRefreshBalances: () => void;
}

type WalletSource = 'arc' | 'gateway';
type RehypothecationProtocol = 'aave' | 'compound' | 'uniswap';

interface Position {
  id: number;
  type: 'long' | 'short';
  size: number;
  collateral: number;
  leverage: number;
  entryPrice: number;
  timestamp: string;
  source: WalletSource;
  protocol: RehypothecationProtocol;
  isDepositing?: boolean;
  isWithdrawing?: boolean;
}

function ExplorerIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

const PROTOCOL_INFO = {
  aave: {
    name: 'Aave V3',
    chain: 'Arbitrum',
    icon: '🏦',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  compound: {
    name: 'Compound V3',
    chain: 'Ethereum',
    icon: '🌾',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  uniswap: {
    name: 'Uniswap V3',
    chain: 'Base',
    icon: '🦄',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
  },
};

export function TradingView({ 
  onBack, 
  arcUsdcBalance: initialArcUsdc,
  arcEurcBalance: initialArcEurc,
  gatewayUsdcBalance: initialGwUsdc,
  gatewayPerChain,
  walletAddress, 
  arcWalletId,
  solanaAddress,
  onRefreshBalances 
}: TradingViewProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const lineSeriesRef = useRef<any>(null);
  
  const [tradingTab, setTradingTab] = useState<'long' | 'short' | 'swap'>('long');
  const [walletSource, setWalletSource] = useState<WalletSource>('arc');
  const [leverage, setLeverage] = useState('1');
  const [collateralAmount, setCollateralAmount] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [rehypothecationProtocol, setRehypothecationProtocol] = useState<RehypothecationProtocol>('aave');
  const [depositingPositionId, setDepositingPositionId] = useState<number | null>(null);
  const [withdrawingPositionId, setWithdrawingPositionId] = useState<number | null>(null);

  // Local balance state for dynamic refresh
  const [arcUsdcBalance, setArcUsdcBalance] = useState(initialArcUsdc);
  const [arcEurcBalance, setArcEurcBalance] = useState(initialArcEurc);
  const [gatewayUsdcBalance, setGatewayUsdcBalance] = useState(initialGwUsdc);

  // Persistent offsets for mock position accounting (survive balance refreshes)
  const arcUsdcOffsetRef = useRef(0);
  const gatewayUsdcOffsetRef = useRef(0);

  // Sync initial props
  useEffect(() => {
    setArcUsdcBalance(initialArcUsdc + arcUsdcOffsetRef.current);
    setArcEurcBalance(initialArcEurc);
    setGatewayUsdcBalance(initialGwUsdc + gatewayUsdcOffsetRef.current);
  }, [initialArcUsdc, initialArcEurc, initialGwUsdc]);

  const arcClient = createPublicClient({ chain: arcTestnet, transport: http() });

  // ── Dynamic balance refresh ─────────────────────────────────────────
  const refreshLocalBalances = useCallback(async () => {
    try {
      // Arc USDC (native, 18 decimals)
      const arcUsdcBal = await arcClient.getBalance({
        address: walletAddress as `0x${string}`,
      });
      setArcUsdcBalance(parseFloat(formatUnits(arcUsdcBal, 18)) + arcUsdcOffsetRef.current);

      // Arc EURC (ERC-20, 6 decimals)
      try {
        const arcEurcBal = await arcClient.readContract({
          address: EURC_ADDRESS as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        }) as bigint;
        setArcEurcBalance(parseFloat(formatUnits(arcEurcBal, 6)));
      } catch {}

      // Gateway balance
      try {
        const res = await fetch('/api/gateway-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evmAddress: walletAddress,
            solanaAddress: solanaAddress,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setGatewayUsdcBalance(parseFloat(data.totalUsdc ?? '0') + gatewayUsdcOffsetRef.current);
        }
      } catch {}
    } catch (e) {
      console.error('TradingView balance refresh error:', e);
    }
  }, [walletAddress, solanaAddress]);

  // Refresh balances on mount and every 10s
  useEffect(() => {
    refreshLocalBalances();
    const id = setInterval(refreshLocalBalances, 10_000);
    return () => clearInterval(id);
  }, [refreshLocalBalances]);

  // Combined refresh (local + parent)
  const handleRefreshAll = useCallback(() => {
    refreshLocalBalances();
    onRefreshBalances();
  }, [refreshLocalBalances, onRefreshBalances]);

  // The effective USDC balance for trading depends on wallet source
  const effectiveUsdcBalance = walletSource === 'arc' ? arcUsdcBalance : gatewayUsdcBalance;
  // EURC is only available from Arc wallet (gateway only holds USDC)
  const effectiveEurcBalance = arcEurcBalance;

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

  // Simulate margin deposit to protocol
  const simulateMarginDeposit = async (positionId: number) => {
    setDepositingPositionId(positionId);
    
    // Mark position as depositing
    setPositions(prev => prev.map(p => 
      p.id === positionId ? { ...p, isDepositing: true } : p
    ));

    // Simulate blockchain transaction delay (3-5 seconds)
    await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));

    // Complete deposit
    setPositions(prev => prev.map(p => 
      p.id === positionId ? { ...p, isDepositing: false } : p
    ));
    setDepositingPositionId(null);
  };

  // Simulate margin withdrawal from protocol
  const simulateMarginWithdrawal = async (positionId: number): Promise<void> => {
    setWithdrawingPositionId(positionId);
    
    // Mark position as withdrawing
    setPositions(prev => prev.map(p => 
      p.id === positionId ? { ...p, isWithdrawing: true } : p
    ));

    // Simulate blockchain transaction delay (3-5 seconds)
    await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));

    setWithdrawingPositionId(null);
  };

  const handleTrade = async () => {
    if (!collateralAmount || parseFloat(collateralAmount) <= 0) {
      alert('Please enter a valid collateral amount');
      return;
    }

    if (parseFloat(collateralAmount) > effectiveUsdcBalance) {
      alert('Insufficient USDC balance');
      return;
    }

    const notionalSize = parseFloat(collateralAmount) * parseFloat(leverage);
    
    const newPosition: Position = {
      id: Date.now(),
      type: tradingTab as 'long' | 'short',
      size: notionalSize,
      collateral: parseFloat(collateralAmount),
      leverage: parseFloat(leverage),
      entryPrice: currentPrice!,
      timestamp: new Date().toISOString(),
      source: walletSource,
      protocol: rehypothecationProtocol,
      isDepositing: false,
      isWithdrawing: false,
    };

    setPositions([...positions, newPosition]);
    setCollateralAmount('');

    // Deduct collateral from the selected wallet source
    const amt = parseFloat(collateralAmount);
    if (walletSource === 'arc') {
      arcUsdcOffsetRef.current -= amt;
      setArcUsdcBalance(prev => Math.max(0, prev - amt));
    } else {
      gatewayUsdcOffsetRef.current -= amt;
      setGatewayUsdcBalance(prev => Math.max(0, prev - amt));
    }
    
    // Simulate margin deposit
    await simulateMarginDeposit(newPosition.id);
    
    const protocolInfo = PROTOCOL_INFO[rehypothecationProtocol];
    alert(`${tradingTab.toUpperCase()} position opened!\nMargin deposited to ${protocolInfo.name} on ${protocolInfo.chain}`);
  };

  const closePosition = async (positionId: number) => {
    const position = positions.find(p => p.id === positionId);
    if (!position) return;

    // Simulate margin withdrawal
    await simulateMarginWithdrawal(positionId);

    // Return collateral to Gateway wallet (cross-chain settlement)
    gatewayUsdcOffsetRef.current += position.collateral;
    setGatewayUsdcBalance(prev => prev + position.collateral);
    
    // Remove position after withdrawal completes
    setPositions(positions.filter(p => p.id !== positionId));
    
    const protocolInfo = PROTOCOL_INFO[position.protocol];
    alert(`Position closed!\nMargin withdrawn from ${protocolInfo.name} → credited to Gateway`);
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
            {/* Explorer link */}
            <a
              href={`https://testnet.arcscan.app/address/${walletAddress}?tab=token_transfers`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:border-slate-400 transition"
              title="View wallet on Arc explorer"
            >
              <ExplorerIcon className="w-3.5 h-3.5" />
              Explorer
            </a>
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
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Protocol</th>
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

                        const protocolInfo = PROTOCOL_INFO[position.protocol];
                        const isProcessing = position.isDepositing || position.isWithdrawing;

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
                              {isProcessing ? (
                                <div className={`flex items-center gap-2 ${protocolInfo.bgColor} ${protocolInfo.borderColor} border rounded px-2 py-1`}>
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-slate-900"></div>
                                  <span className="text-xs font-medium text-slate-700">
                                    {position.isDepositing ? 'Depositing...' : 'Withdrawing...'}
                                  </span>
                                </div>
                              ) : (
                                <span className={`inline-flex items-center gap-1 text-xs font-medium ${protocolInfo.color}`}>
                                  <span>{protocolInfo.icon}</span>
                                  <span>{protocolInfo.name}</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className={`text-sm font-semibold ${pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                ${pnl.toFixed(2)}
                                <span className="text-xs ml-1">({pnlPercent.toFixed(2)}%)</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => closePosition(position.id)}
                                disabled={isProcessing}
                                className="px-3 py-1 text-xs bg-slate-900 text-white rounded hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {position.isWithdrawing ? 'Closing...' : 'Close'}
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

            {/* ── Wallet Source Toggle ──────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-900">Funding Source</p>
                <a
                  href={
                    walletSource === 'gateway'
                      ? `https://testnet.arcscan.app/address/${GATEWAY_WALLET_ADDRESS}?tab=token_transfers`
                      : `https://testnet.arcscan.app/address/${walletAddress}?tab=token_transfers`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-700"
                  title="View on explorer"
                >
                  <ExplorerIcon className="w-4 h-4" />
                </a>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={() => setWalletSource('arc')}
                  className={`rounded-lg p-3 border-2 text-left transition ${
                    walletSource === 'arc'
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-900">🌐 Arc Wallet</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">${arcUsdcBalance.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">USDC</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">€{arcEurcBalance.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">EURC</p>
                </button>
                <button
                  onClick={() => setWalletSource('gateway')}
                  className={`rounded-lg p-3 border-2 text-left transition ${
                    walletSource === 'gateway'
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-slate-200 hover:border-emerald-400'
                  }`}
                >
                  <p className="text-xs font-semibold text-emerald-800">⚡ Gateway</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">${gatewayUsdcBalance.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">USDC (unified)</p>
                  <p className="text-xs text-slate-400 mt-1 italic">No EURC support</p>
                </button>
              </div>
              <p className="text-xs text-slate-500 font-mono break-all">
                {walletSource === 'gateway'
                  ? GATEWAY_WALLET_ADDRESS
                  : walletAddress}
              </p>
            </div>

            {/* ── Trading Tabs ─────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-slate-200">
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
                <button
                  onClick={() => setTradingTab('swap')}
                  className={`flex-1 py-3 px-4 text-sm font-semibold ${
                    tradingTab === 'swap'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Spot Swap
                </button>
              </div>

              <div className="p-6">
                {/* StableFX Swap Tab */}
                {tradingTab === 'swap' && (
                  <StableFXSwap
                    walletAddress={walletAddress}
                    arcWalletId={arcWalletId}
                    usdcBalance={arcUsdcBalance}
                    eurcBalance={arcEurcBalance}
                    onRefreshBalances={handleRefreshAll}
                  />
                )}

                {/* Long/Short Tabs - Demo perpetuals trading */}
                {(tradingTab === 'long' || tradingTab === 'short') && (
                  <div className="space-y-6">
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                      <p className="text-sm text-amber-900">
                        <strong>Demo Mode:</strong> Perpetual futures trading is currently in demo mode. Use Spot Swap tab for real StableFX conversions.
                      </p>
                    </div>

                    {/* Balance Display */}
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-slate-600">
                          Available Balance ({walletSource === 'gateway' ? 'Gateway' : 'Arc Wallet'})
                        </p>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">${effectiveUsdcBalance.toFixed(2)}</p>
                      <p className="text-xs text-slate-500 mt-1">USDC</p>
                      {walletSource === 'gateway' && (
                        <p className="text-xs text-amber-600 mt-2">
                          Gateway holds USDC only. For EURC positions, switch to Arc Wallet.
                        </p>
                      )}
                    </div>

                    {/* ── Margin Rehypothecation Protocol Selection ──── */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-3">
                        Margin Rehypothecation
                      </label>
                      <div className="space-y-2">
                        {Object.entries(PROTOCOL_INFO).map(([key, info]) => (
                          <button
                            key={key}
                            onClick={() => setRehypothecationProtocol(key as RehypothecationProtocol)}
                            className={`w-full rounded-lg p-3 border-2 text-left transition ${
                              rehypothecationProtocol === key
                                ? `${info.borderColor} ${info.bgColor}`
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{info.icon}</span>
                                <div>
                                  <p className={`text-sm font-semibold ${info.color}`}>{info.name}</p>
                                  <p className="text-xs text-slate-600">{info.chain}</p>
                                </div>
                              </div>
                              {rehypothecationProtocol === key && (
                                <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Your margin will be automatically deposited to earn yield via CCTP
                      </p>
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
                        max={effectiveUsdcBalance}
                        value={collateralAmount}
                        onChange={(e) => setCollateralAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-lg font-semibold"
                      />
                      <button
                        onClick={() => setCollateralAmount(effectiveUsdcBalance.toFixed(2))}
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
                        <span className="text-slate-600">Source</span>
                        <span className="font-semibold text-slate-900">
                          {walletSource === 'gateway' ? 'Gateway (USDC)' : 'Arc Wallet'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Margin Protocol</span>
                        <span className="font-semibold text-slate-900">
                          {PROTOCOL_INFO[rehypothecationProtocol].name}
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
                      Demo trading interface. Margin will be deposited to {PROTOCOL_INFO[rehypothecationProtocol].name}.
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