'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { avalancheFuji, baseSepolia } from 'viem/chains';
import { Connection, PublicKey } from '@solana/web3.js';
import { TradingView } from './TradingView';

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USDC', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://arc-testnet.drpc.org'] } },
} as const;

interface Wallet {
  address: string;
  walletId: string;
  blockchain: string;
}

interface WalletData {
  arc: Wallet;
  avax: Wallet;
  base: Wallet;
  solana: Wallet;
}

interface Props {
  wallets: WalletData;
  walletSetId: string;
  sharedAddress: string;
}

const ERC20_ABI = [{
  constant: true,
  inputs: [{ name: '_owner', type: 'address' }],
  name: 'balanceOf',
  outputs: [{ name: 'balance', type: 'uint256' }],
  type: 'function',
}] as const;

const TOKEN_ADDRESSES = {
  'ARC-TESTNET': {
    USDC: '0x3600000000000000000000000000000000000000',
    EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  },
  'AVAX-FUJI': {
    USDC: '0x5425890298aed601595a70AB815c96711a31Bc65',
    EURC: '0x5E44db7996c682E92a960b65AC713a54AD815c6B',
  },
  'BASE-SEPOLIA': {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    EURC: '0x808456652fdb597867f38412077A9182bf77359F',
  },
  'SOL-DEVNET': {
    USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    EURC: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr',
  },
};

// Gateway Wallet contract address (same on all EVM testnets)
const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';

type DepositStep = 'idle' | 'approving' | 'depositing' | 'waiting-finality' | 'done' | 'error';

// ── Explorer URL helpers ──────────────────────────────────────────────
function addressExplorerUrl(chain: string, address: string): string {
  switch (chain) {
    case 'arc':
      return `https://testnet.arcscan.app/address/${address}?tab=token_transfers`;
    case 'avax':
      return `https://testnet.snowtrace.io/address/${address}`;
    case 'base':
      return `https://sepolia.basescan.org/address/${address}`;
    case 'solana':
      return `https://explorer.solana.com/address/${address}?cluster=devnet`;
    default:
      return '#';
  }
}

function txExplorerUrl(chain: string, txHash: string): string {
  switch (chain) {
    case 'arc':
      return `https://testnet.arcscan.app/tx/${txHash}`;
    case 'avax':
      return `https://testnet.snowtrace.io/tx/${txHash}`;
    case 'base':
      return `https://sepolia.basescan.org/tx/${txHash}`;
    default:
      return '#';
  }
}

function ExplorerIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export function MultiChainWalletInterface({ wallets, walletSetId, sharedAddress }: Props) {
  const [balances, setBalances] = useState({
    arc: { usdc: '0', eurc: '0' },
    avax: { usdc: '0', eurc: '0' },
    base: { usdc: '0', eurc: '0' },
    solana: { usdc: '0', eurc: '0' },
  });

  const [gatewayBalance, setGatewayBalance] = useState({
    totalUsdc: '0',
    perChain: {} as Record<string, string>,
  });

  const [activeTab, setActiveTab] = useState('fund');
  const [selectedChain, setSelectedChain] = useState<'arc' | 'avax' | 'base'>('arc');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositStep, setDepositStep] = useState<DepositStep>('idle');
  const [depositError, setDepositError] = useState('');
  const [depositResult, setDepositResult] = useState<{ approvalTxHash?: string; depositTxHash?: string } | null>(null);
  const [fundingChain, setFundingChain] = useState<string | null>(null);
  const [showTrading, setShowTrading] = useState(false);

  const arcClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const avaxClient = createPublicClient({ chain: avalancheFuji, transport: http() });
  const baseClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const solanaConnection = new Connection('https://api.devnet.solana.com');

  // ── Fetch on-chain wallet balances ──────────────────────────────────
  const fetchBalances = useCallback(async () => {
    try {
      // Arc USDC (native – 18 decimals)
      const arcUsdcBal = await arcClient.getBalance({
        address: sharedAddress as `0x${string}`,
      });

      let arcEurcBal = BigInt(0);
      try {
        arcEurcBal = await arcClient.readContract({
          address: TOKEN_ADDRESSES['ARC-TESTNET'].EURC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [sharedAddress as `0x${string}`],
        }) as bigint;
      } catch {}

      // Avax USDC (6 decimals)
      let avaxUsdcBal = BigInt(0);
      try {
        avaxUsdcBal = await avaxClient.readContract({
          address: TOKEN_ADDRESSES['AVAX-FUJI'].USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [sharedAddress as `0x${string}`],
        }) as bigint;
      } catch {}

      // Avax EURC (6 decimals)
      let avaxEurcBal = BigInt(0);
      try {
        avaxEurcBal = await avaxClient.readContract({
          address: TOKEN_ADDRESSES['AVAX-FUJI'].EURC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [sharedAddress as `0x${string}`],
        }) as bigint;
      } catch {}

      // Base USDC (6 decimals)
      let baseUsdcBal = BigInt(0);
      try {
        baseUsdcBal = await baseClient.readContract({
          address: TOKEN_ADDRESSES['BASE-SEPOLIA'].USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [sharedAddress as `0x${string}`],
        }) as bigint;
      } catch {}

      // Base EURC (6 decimals)
      let baseEurcBal = BigInt(0);
      try {
        baseEurcBal = await baseClient.readContract({
          address: TOKEN_ADDRESSES['BASE-SEPOLIA'].EURC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [sharedAddress as `0x${string}`],
        }) as bigint;
      } catch {}

      // Solana USDC
      let solUsdcBal = '0';
      try {
        const pk = new PublicKey(wallets.solana.address);
        const accts = await solanaConnection.getParsedTokenAccountsByOwner(pk, {
          mint: new PublicKey(TOKEN_ADDRESSES['SOL-DEVNET'].USDC),
        });
        if (accts.value.length > 0) {
          solUsdcBal = accts.value[0].account.data.parsed.info.tokenAmount.uiAmount?.toString() || '0';
        }
      } catch {}

      // Solana EURC
      let solEurcBal = '0';
      try {
        const pk = new PublicKey(wallets.solana.address);
        const accts = await solanaConnection.getParsedTokenAccountsByOwner(pk, {
          mint: new PublicKey(TOKEN_ADDRESSES['SOL-DEVNET'].EURC),
        });
        if (accts.value.length > 0) {
          solEurcBal = accts.value[0].account.data.parsed.info.tokenAmount.uiAmount?.toString() || '0';
        }
      } catch {}

      setBalances({
        arc:    { usdc: formatUnits(arcUsdcBal, 18),   eurc: formatUnits(arcEurcBal, 6) },
        avax:   { usdc: formatUnits(avaxUsdcBal, 6),   eurc: formatUnits(avaxEurcBal, 6) },
        base:   { usdc: formatUnits(baseUsdcBal, 6),   eurc: formatUnits(baseEurcBal, 6) },
        solana: { usdc: solUsdcBal,                     eurc: solEurcBal },
      });
    } catch (e) {
      console.error('Fetch balances error:', e);
    }
  }, [sharedAddress, wallets.solana.address]);

  // ── Fetch Gateway unified balance ───────────────────────────────────
  const fetchGatewayBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evmAddress: sharedAddress,
          solanaAddress: wallets.solana.address,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGatewayBalance({
          totalUsdc: data.totalUsdc ?? '0',
          perChain: data.perChain ?? {},
        });
      }
    } catch (e) {
      console.error('Gateway balance error:', e);
    }
  }, [sharedAddress, wallets.solana.address]);

  useEffect(() => {
    fetchBalances();
    fetchGatewayBalance();
    const id = setInterval(() => {
      fetchBalances();
      fetchGatewayBalance();
    }, 10_000);
    return () => clearInterval(id);
  }, [fetchBalances, fetchGatewayBalance]);

  const totalUSDC  = parseFloat(balances.arc.usdc) + parseFloat(balances.avax.usdc) + parseFloat(balances.base.usdc) + parseFloat(balances.solana.usdc);
  const totalEURC  = parseFloat(balances.arc.eurc) + parseFloat(balances.avax.eurc) + parseFloat(balances.base.eurc) + parseFloat(balances.solana.eurc);
  const gwTotal    = parseFloat(gatewayBalance.totalUsdc);

  // ── Faucet ──────────────────────────────────────────────────────────
  const handleFaucetRequest = async (blockchain: string, address: string) => {
    setFundingChain(blockchain);
    try {
      const res = await fetch('/api/request-faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, blockchain }),
      });
      const data = await res.json();
      if (data.error) {
        alert('Error: ' + data.error + '\n\nPlease use manual faucet links below if rate limited.');
      } else {
        alert('Faucet tokens requested! Check your wallet in a few moments.');
        setTimeout(fetchBalances, 5000);
      }
    } catch {
      alert('Failed to request faucet. Please use manual faucet links.');
    } finally {
      setFundingChain(null);
    }
  };

  // ── Gateway Deposit (EVM) ───────────────────────────────────────────
  const handleGatewayDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) {
      setDepositError('Please enter a valid amount');
      return;
    }

    setDepositStep('approving');
    setDepositError('');
    setDepositResult(null);

    const blockchainMap = {
      arc: 'ARC-TESTNET',
      avax: 'AVAX-FUJI',
      base: 'BASE-SEPOLIA',
    };
    const blockchain = blockchainMap[selectedChain];
    const walletId   = selectedChain === 'arc' ? wallets.arc.walletId : 
                       selectedChain === 'avax' ? wallets.avax.walletId :
                       wallets.base.walletId;

    try {
      const res = await fetch('/api/gateway-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId, blockchain, amount: depositAmount }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Deposit failed');
      }

      setDepositResult({
        approvalTxHash: data.approvalTxHash,
        depositTxHash: data.depositTxHash,
      });
      setDepositStep('waiting-finality');
      setDepositAmount('');

      setTimeout(() => { fetchBalances(); fetchGatewayBalance(); }, 5_000);
      setTimeout(() => { fetchGatewayBalance(); }, 30_000);
      setTimeout(() => { fetchGatewayBalance(); setDepositStep('done'); }, 60_000);
    } catch (err: any) {
      setDepositStep('error');
      setDepositError(err.message || 'Gateway deposit failed');
    }
  };

  const resetDeposit = () => {
    setDepositStep('idle');
    setDepositError('');
    setDepositResult(null);
  };

  // ── Helpers ─────────────────────────────────────────────────────────
  const copyAddr = (addr: string, name: string) => {
    navigator.clipboard.writeText(addr);
    alert(name + ' address copied!');
  };

  const chainAvailable = (chain: 'arc' | 'avax' | 'base') => {
    const bal = chain === 'arc' ? balances.arc.usdc : 
                chain === 'avax' ? balances.avax.usdc :
                balances.base.usdc;
    return parseFloat(bal) > 0;
  };

  // ── Trading redirect ───────────────────────────────────────────────
  if (showTrading) {
    return (
      <TradingView 
        onBack={() => setShowTrading(false)} 
        arcUsdcBalance={parseFloat(balances.arc.usdc)}
        arcEurcBalance={parseFloat(balances.arc.eurc)}
        gatewayUsdcBalance={gwTotal}
        gatewayPerChain={gatewayBalance.perChain}
        walletAddress={sharedAddress}
        arcWalletId={wallets.arc.walletId}
        solanaAddress={wallets.solana.address}
        onRefreshBalances={() => {
          fetchBalances();
          fetchGatewayBalance();
        }}
      />
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Summary Card ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <p className="text-sm font-medium text-slate-600 mb-1">Wallet Balances (Across All Chains)</p>
            <div className="flex items-baseline gap-6">
              <div>
                <p className="text-4xl font-bold text-slate-900">${totalUSDC.toFixed(2)}</p>
                <p className="text-sm text-slate-500 mt-1">USDC</p>
              </div>
              <div className="pl-4 border-l border-slate-200">
                <p className="text-2xl font-semibold text-slate-900">€{totalEURC.toFixed(2)}</p>
                <p className="text-sm text-slate-500 mt-1">EURC</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Raw on-chain balances (not unified)</p>
          </div>

          <div className="border-l border-slate-200 pl-8">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-emerald-600">Gateway Unified Balance</p>
              <a
                href={addressExplorerUrl('arc', GATEWAY_WALLET_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-500 hover:text-emerald-700"
                title="View Gateway contract on explorer"
              >
                <ExplorerIcon className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-4xl font-bold text-slate-900">${gwTotal.toFixed(2)}</p>
            <p className="text-sm text-slate-500 mt-1">USDC</p>
            {gwTotal > 0 ? (
              <div className="mt-2 flex gap-3 text-xs text-slate-500">
                {gatewayBalance.perChain.arc && <span>Arc: ${parseFloat(gatewayBalance.perChain.arc).toFixed(2)}</span>}
                {gatewayBalance.perChain.avax && <span>Avax: ${parseFloat(gatewayBalance.perChain.avax).toFixed(2)}</span>}
                {gatewayBalance.perChain.base && <span>Base: ${parseFloat(gatewayBalance.perChain.base).toFixed(2)}</span>}
                {gatewayBalance.perChain.solana && <span>Sol: ${parseFloat(gatewayBalance.perChain.solana).toFixed(2)}</span>}
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-2">Deposit in Gateway tab to unify</p>
            )}
          </div>
        </div>

        {/* Addresses */}
        <div className="space-y-3 mb-6">
          <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200 flex justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold text-emerald-800 uppercase mb-1">EVM Address</p>
              <p className="font-mono text-sm text-slate-900 break-all">{sharedAddress}</p>
              <p className="text-xs text-emerald-700 mt-2">Same on Arc, Avalanche, and Base</p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => copyAddr(sharedAddress, 'EVM')} className="p-2 hover:bg-emerald-100 rounded" title="Copy address">
                <svg className="w-5 h-5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
              <a
                href={addressExplorerUrl('arc', sharedAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-emerald-100 rounded"
                title="View on Arc explorer"
              >
                <ExplorerIcon className="w-5 h-5 text-emerald-700" />
              </a>
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200 flex justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold text-purple-800 uppercase mb-1">Solana Address</p>
              <p className="font-mono text-sm text-slate-900 break-all">{wallets.solana.address}</p>
              <p className="text-xs text-purple-700 mt-2">Solana Devnet</p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => copyAddr(wallets.solana.address, 'Solana')} className="p-2 hover:bg-purple-100 rounded" title="Copy address">
                <svg className="w-5 h-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
              <a
                href={addressExplorerUrl('solana', wallets.solana.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-purple-100 rounded"
                title="View on Solana explorer"
              >
                <ExplorerIcon className="w-5 h-5 text-purple-700" />
              </a>
            </div>
          </div>
        </div>

        {/* Per-chain balances */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Arc Testnet', icon: '🌐', chain: 'arc' as const },
            { label: 'Avalanche Fuji', icon: '🔺', chain: 'avax' as const },
            { label: 'Base Sepolia', icon: '🔵', chain: 'base' as const },
            { label: 'Solana Devnet', icon: '◎', chain: 'solana' as const },
          ].map(({ label, icon, chain }) => (
            <div key={chain} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{icon}</span>
                  <p className="font-semibold text-slate-900 text-sm">{label}</p>
                </div>
                <a
                  href={addressExplorerUrl(chain, chain === 'solana' ? wallets.solana.address : sharedAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-700"
                  title={`View on ${label} explorer`}
                >
                  <ExplorerIcon className="w-4 h-4" />
                </a>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">USDC</p>
                  <p className="text-lg font-bold text-slate-900">${parseFloat(balances[chain].usdc).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">EURC</p>
                  <p className="text-lg font-bold text-slate-900">€{parseFloat(balances[chain].eurc).toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          {['fund', 'gateway', 'trade'].map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={
                'flex-1 px-6 py-4 text-sm font-semibold ' +
                (activeTab === tab
                  ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50'
                  : 'text-slate-500')
              }
            >
              Step {i + 1}: {tab === 'fund' ? 'Fund' : tab === 'gateway' ? 'Gateway' : 'Trade'}
            </button>
          ))}
        </div>

        <div className="p-6">

          {/* ── Fund Tab ──────────────────────────────────────────── */}
          {activeTab === 'fund' && (
            <div className="space-y-6">
              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">Fund Wallets via API</h3>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    { bc: 'ARC-TESTNET',   addr: sharedAddress,        color: 'emerald', label: 'Fund Arc Testnet',   sub: 'USDC (native) + EURC' },
                    { bc: 'AVAX-FUJI',     addr: sharedAddress,        color: 'red',     label: 'Fund Avalanche Fuji', sub: 'USDC + EURC' },
                    { bc: 'BASE-SEPOLIA',  addr: sharedAddress,        color: 'blue',    label: 'Fund Base Sepolia',  sub: 'Native + USDC + EURC' },
                    { bc: 'SOL-DEVNET',    addr: wallets.solana.address, color: 'purple',  label: 'Fund Solana Devnet', sub: 'Native + USDC + EURC' },
                  ].map(({ bc, addr, color, label, sub }) => (
                    <button
                      key={bc}
                      onClick={() => handleFaucetRequest(bc, addr)}
                      disabled={fundingChain === bc}
                      className={`bg-white border-2 border-${color}-600 hover:bg-${color}-50 disabled:opacity-50 rounded-lg py-4 px-4 transition`}
                    >
                      <p className="font-semibold text-slate-900 mb-1">
                        {fundingChain === bc ? 'Funding...' : label}
                      </p>
                      <p className="text-xs text-slate-600">{sub}</p>
                    </button>
                  ))}
                </div>

                <div className="border-t border-slate-300 pt-4">
                  <p className="text-xs text-slate-600 mb-3 font-medium">Or use manual faucet links (if rate-limited):</p>
                  <div className="grid grid-cols-4 gap-3">
                    <a href={'https://faucet.circle.com/?address=' + sharedAddress + '&chain=ARC'} target="_blank" rel="noopener noreferrer" className="text-xs text-center bg-white border border-slate-300 rounded-lg py-2 px-3 hover:border-emerald-600 hover:bg-emerald-50 transition">
                      Arc USDC Faucet ↗
                    </a>
                    <a href="https://faucet.avax.network/" target="_blank" rel="noopener noreferrer" className="text-xs text-center bg-white border border-slate-300 rounded-lg py-2 px-3 hover:border-red-600 hover:bg-red-50 transition">
                      Avax Native Faucet ↗
                    </a>
                    <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank" rel="noopener noreferrer" className="text-xs text-center bg-white border border-slate-300 rounded-lg py-2 px-3 hover:border-blue-600 hover:bg-blue-50 transition">
                      Base Native Faucet ↗
                    </a>
                    <a href={'https://faucet.solana.com/?address=' + wallets.solana.address} target="_blank" rel="noopener noreferrer" className="text-xs text-center bg-white border border-slate-300 rounded-lg py-2 px-3 hover:border-purple-600 hover:bg-purple-50 transition">
                      Sol Native Faucet ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Gateway Tab ───────────────────────────────────────── */}
          {activeTab === 'gateway' && (
            <div className="space-y-6">
              {/* Balance overview */}
              <div className="bg-emerald-50 rounded-lg p-6 border border-emerald-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900">Circle Gateway Unified Balance</h3>
                      <a
                        href={addressExplorerUrl('arc', GATEWAY_WALLET_ADDRESS)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-500 hover:text-emerald-700"
                        title="View Gateway contract on explorer"
                      >
                        <ExplorerIcon className="w-4 h-4" />
                      </a>
                    </div>
                    <p className="text-sm text-slate-700">
                      Deposit USDC from Arc, Avax, or Base into the Gateway Wallet contract. Once finalized, the balance is unified and accessible on any supported chain.
                    </p>
                  </div>
                  <div className="text-right min-w-[140px]">
                    <p className="text-xs text-slate-600 mb-1">Unified Balance</p>
                    <p className="text-3xl font-bold text-slate-900">${gwTotal.toFixed(2)}</p>
                    <p className="text-xs text-slate-500">USDC only</p>
                  </div>
                </div>
                {gwTotal > 0 && (
                  <div className="mt-3 pt-3 border-t border-emerald-200 grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Arc:</span>{' '}
                      <span className="font-semibold">${parseFloat(gatewayBalance.perChain.arc || '0').toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Avax:</span>{' '}
                      <span className="font-semibold">${parseFloat(gatewayBalance.perChain.avax || '0').toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Base:</span>{' '}
                      <span className="font-semibold">${parseFloat(gatewayBalance.perChain.base || '0').toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Solana:</span>{' '}
                      <span className="font-semibold">${parseFloat(gatewayBalance.perChain.solana || '0').toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Deposit form */}
              <div className="bg-white rounded-lg p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">Deposit USDC to Gateway</h3>

                {depositStep === 'idle' || depositStep === 'error' ? (
                  <form onSubmit={handleGatewayDeposit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Source Chain</label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['arc', 'avax', 'base'] as const).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setSelectedChain(c)}
                            className={
                              'rounded-lg p-4 border-2 text-left transition ' +
                              (selectedChain === c
                                ? 'border-slate-900 bg-slate-50'
                                : 'border-slate-200 hover:border-slate-400')
                            }
                          >
                            <p className="font-semibold text-slate-900 text-sm">
                              {c === 'arc' ? '🌐 Arc Testnet' : c === 'avax' ? '🔺 Avalanche Fuji' : '🔵 Base Sepolia'}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Available: ${parseFloat(balances[c].usdc).toFixed(2)} USDC
                            </p>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Solana Gateway deposits coming soon — requires Anchor program integration with developer-controlled wallets.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Amount (USDC)</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const bal = selectedChain === 'arc' ? balances.arc.usdc : 
                                        selectedChain === 'avax' ? balances.avax.usdc :
                                        balances.base.usdc;
                            const max = Math.max(0, parseFloat(bal) - 0.01);
                            setDepositAmount(max.toFixed(2));
                          }}
                          className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
                        >
                          Max
                        </button>
                      </div>
                    </div>

                    {depositError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                        {depositError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={!chainAvailable(selectedChain) || !depositAmount}
                      className="w-full px-6 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
                    >
                      Deposit to Gateway
                    </button>

                    <p className="text-xs text-slate-500">
                      This will approve &amp; deposit USDC into the Gateway Wallet contract. The unified balance updates after source-chain finality (typically 1–19 min depending on chain).
                    </p>
                  </form>
                ) : depositStep === 'approving' || depositStep === 'depositing' ? (
                  <div className="py-10 text-center space-y-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900 mx-auto" />
                    <p className="font-semibold text-slate-900">
                      {depositStep === 'approving' ? 'Approving USDC spend...' : 'Depositing to Gateway...'}
                    </p>
                    <p className="text-sm text-slate-500">
                      This may take 30–60 seconds. Please wait.
                    </p>
                  </div>
                ) : depositStep === 'waiting-finality' || depositStep === 'done' ? (
                  <div className="space-y-4">
                    <div className={'rounded-lg p-4 border ' + (depositStep === 'done' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200')}>
                      <p className="font-semibold text-slate-900 mb-2">
                        {depositStep === 'done' ? '✅ Deposit Complete' : '⏳ Waiting for Finality'}
                      </p>
                      <p className="text-sm text-slate-700">
                        {depositStep === 'done'
                          ? 'Your Gateway unified balance has been updated.'
                          : 'Deposit transaction confirmed. Your unified balance will update once the source chain reaches finality.'}
                      </p>
                    </div>

                    {depositResult?.approvalTxHash && (
                      <div className="text-xs space-y-1">
                        <p className="text-slate-500">
                          Approval tx:{' '}
                          <a
                            href={txExplorerUrl(selectedChain, depositResult.approvalTxHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-blue-600 hover:underline"
                          >
                            {depositResult.approvalTxHash.slice(0, 10)}...{depositResult.approvalTxHash.slice(-8)}
                          </a>
                        </p>
                        {depositResult.depositTxHash && (
                          <p className="text-slate-500">
                            Deposit tx:{' '}
                            <a
                              href={txExplorerUrl(selectedChain, depositResult.depositTxHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-blue-600 hover:underline"
                            >
                              {depositResult.depositTxHash.slice(0, 10)}...{depositResult.depositTxHash.slice(-8)}
                            </a>
                          </p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={resetDeposit}
                      className="w-full px-6 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition"
                    >
                      Make Another Deposit
                    </button>
                  </div>
                ) : null}
              </div>

              {/* How it works */}
              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-3">How Gateway Unification Works</h4>
                <div className="grid grid-cols-3 gap-4 text-sm text-slate-700">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">1. Deposit</p>
                    <p>USDC is deposited into the Gateway Wallet contract on the source chain. After finality, it is credited to your unified balance.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">2. Unified Balance</p>
                    <p>Your deposits from all chains are aggregated and can be used as a unified balance in the trading terminal.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">3. Finality</p>
                    <p>Transfer time depends on chain Finality. Note that Base Sepolia deposits can take upto 20 minutes</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Trade Tab ─────────────────────────────────────────── */}
          {activeTab === 'trade' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-8 text-white">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold mb-2">Ready to Trade</h3>
                    <p className="text-slate-300">
                      Your wallet is funded. Start trading EUR/USD derivatives or swap via StableFX.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 mb-1">Arc Wallet</p>
                    <p className="text-3xl font-bold">${parseFloat(balances.arc.usdc).toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mt-1">USDC + €{parseFloat(balances.arc.eurc).toFixed(2)} EURC</p>
                    {gwTotal > 0 && (
                      <>
                        <p className="text-xs text-emerald-400 mt-3 mb-0.5">Gateway</p>
                        <p className="text-lg font-bold">${gwTotal.toFixed(2)} USDC</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                    <p className="text-xs text-slate-300 mb-1">Market</p>
                    <p className="text-lg font-semibold">EUR/USD</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                    <p className="text-xs text-slate-300 mb-1">Options</p>
                    <p className="text-lg font-semibold">Spot & Perps</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                    <p className="text-xs text-slate-300 mb-1">Settlement</p>
                    <p className="text-lg font-semibold">USDC/EURC</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowTrading(true)}
                  className="w-full px-6 py-4 bg-white text-slate-900 font-bold rounded-lg hover:bg-slate-100 transition text-lg shadow-lg"
                >
                  Launch Trading Interface →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}