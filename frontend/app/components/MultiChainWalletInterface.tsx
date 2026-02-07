'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
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
  'BASE-SEPOLIA': {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    EURC: '0x808456652fdb597867f38412077A9182bf77359F',
  },
  'SOL-DEVNET': {
    USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    EURC: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr',
  },
};

export function MultiChainWalletInterface({ wallets, walletSetId, sharedAddress }: Props) {
  const [balances, setBalances] = useState({
    arc: { usdc: '0', eurc: '0' },
    base: { usdc: '0', eurc: '0' },
    solana: { usdc: '0', eurc: '0' },
  });
  
  const [gatewayBalances, setGatewayBalances] = useState({
    usdc: '0',
    eurc: '0',
  });
  
  const [activeTab, setActiveTab] = useState('fund');
  const [selectedChain, setSelectedChain] = useState('arc');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositToken, setDepositToken] = useState('USDC');
  const [depositing, setDepositing] = useState(false);
  const [fundingChain, setFundingChain] = useState<string | null>(null);
  const [showTrading, setShowTrading] = useState(false);

  const arcClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const baseClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const solanaConnection = new Connection('https://api.devnet.solana.com');

  const fetchBalances = async () => {
    try {
      // Arc USDC (native - 18 decimals)
      const arcUsdcBal = await arcClient.getBalance({ 
        address: sharedAddress as `0x${string}` 
      });
      
      // Arc EURC (ERC20 - 6 decimals)
      let arcEurcBal = BigInt(0);
      try {
        arcEurcBal = await arcClient.readContract({
          address: TOKEN_ADDRESSES['ARC-TESTNET'].EURC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [sharedAddress as `0x${string}`],
        }) as bigint;
      } catch (e) {
        console.error('Arc EURC error:', e);
      }

      // Base USDC (ERC20 - 6 decimals)
      let baseUsdcBal = BigInt(0);
      try {
        baseUsdcBal = await baseClient.readContract({
          address: TOKEN_ADDRESSES['BASE-SEPOLIA'].USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [sharedAddress as `0x${string}`],
        }) as bigint;
      } catch (e) {
        console.error('Base USDC error:', e);
      }

      // Base EURC (ERC20 - 6 decimals)
      let baseEurcBal = BigInt(0);
      try {
        baseEurcBal = await baseClient.readContract({
          address: TOKEN_ADDRESSES['BASE-SEPOLIA'].EURC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [sharedAddress as `0x${string}`],
        }) as bigint;
      } catch (e) {
        console.error('Base EURC error:', e);
      }

      // Solana USDC
      let solUsdcBal = '0';
      try {
        const pk = new PublicKey(wallets.solana.address);
        const usdcAccounts = await solanaConnection.getParsedTokenAccountsByOwner(
          pk,
          { mint: new PublicKey(TOKEN_ADDRESSES['SOL-DEVNET'].USDC) }
        );
        if (usdcAccounts.value.length > 0) {
          solUsdcBal = usdcAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount?.toString() || '0';
        }
      } catch (e) {
        console.error('Solana USDC error:', e);
      }

      // Solana EURC
      let solEurcBal = '0';
      try {
        const pk = new PublicKey(wallets.solana.address);
        const eurcAccounts = await solanaConnection.getParsedTokenAccountsByOwner(
          pk,
          { mint: new PublicKey(TOKEN_ADDRESSES['SOL-DEVNET'].EURC) }
        );
        if (eurcAccounts.value.length > 0) {
          solEurcBal = eurcAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount?.toString() || '0';
        }
      } catch (e) {
        console.error('Solana EURC error:', e);
      }

      setBalances({
        arc: { 
          usdc: formatUnits(arcUsdcBal, 18), 
          eurc: formatUnits(arcEurcBal, 6) 
        },
        base: { 
          usdc: formatUnits(baseUsdcBal, 6), 
          eurc: formatUnits(baseEurcBal, 6) 
        },
        solana: { 
          usdc: solUsdcBal, 
          eurc: solEurcBal 
        },
      });
    } catch (e) {
      console.error('Fetch error:', e);
    }
  };

  const fetchGatewayBalances = async () => {
    try {
      const response = await fetch('https://gateway-api-testnet.circle.com/v1/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'USDC',
          sources: [
            { domain: 26, depositor: sharedAddress }, // Arc
            { domain: 6, depositor: sharedAddress },  // Base
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let totalUsdc = 0;
        data.balances.forEach((b: any) => {
          totalUsdc += parseFloat(b.balance || '0');
        });
        setGatewayBalances(prev => ({ ...prev, usdc: totalUsdc.toFixed(6) }));
      }
    } catch (e) {
      console.error('Gateway balance error:', e);
    }
  };

  useEffect(() => {
    fetchBalances();
    fetchGatewayBalances();
    const interval = setInterval(() => {
      fetchBalances();
      fetchGatewayBalances();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const totalUSDC = parseFloat(balances.arc.usdc) + parseFloat(balances.base.usdc) + parseFloat(balances.solana.usdc);
  const totalEURC = parseFloat(balances.arc.eurc) + parseFloat(balances.base.eurc) + parseFloat(balances.solana.eurc);

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
    } catch (err) {
      alert('Failed to request faucet. Please use manual faucet links.');
    } finally {
      setFundingChain(null);
    }
  };

  const handleGatewayDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setDepositing(true);
    try {
      const res = await fetch('/api/gateway-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: sharedAddress,
          blockchain: selectedChain === 'arc' ? 'ARC-TESTNET' : 'BASE-SEPOLIA',
          token: depositToken,
          amount: depositAmount,
        }),
      });
      
      const data = await res.json();
      if (data.error) {
        alert('Error: ' + data.error);
      } else {
        alert(data.message);
        setDepositAmount('');
        setTimeout(() => {
          fetchBalances();
          fetchGatewayBalances();
        }, 3000);
      }
    } catch (err) {
      alert('Failed to deposit to Gateway');
    } finally {
      setDepositing(false);
    }
  };

  const copyAddr = (addr: string, name: string) => {
    navigator.clipboard.writeText(addr);
    alert(name + ' address copied!');
  };

  // If trading view is active, show that instead
  if (showTrading) {
    return (
      <TradingView 
        onBack={() => setShowTrading(false)}
        usdcBalance={totalUSDC}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="grid grid-cols-2 gap-8 mb-6">
          {/* Wallet Balances */}
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
            <p className="text-xs text-slate-500 mt-2">Not unified via Gateway</p>
          </div>

          {/* Gateway Unified Balance */}
          <div className="border-l border-slate-200 pl-8">
            <p className="text-sm font-medium text-emerald-600 mb-1">Gateway Unified Balance</p>
            <div className="flex items-baseline gap-6">
              <div>
                <p className="text-4xl font-bold text-slate-900">${parseFloat(gatewayBalances.usdc).toFixed(2)}</p>
                <p className="text-sm text-slate-500 mt-1">USDC</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {parseFloat(gatewayBalances.usdc) > 0 
                ? 'Unified across Arc & Base' 
                : 'Deposit in Gateway tab to unify'
              }
            </p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
            <div className="flex justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold text-emerald-800 uppercase mb-1">EVM Address</p>
                <p className="font-mono text-sm text-slate-900 break-all">{sharedAddress}</p>
                <p className="text-xs text-emerald-700 mt-2">Same on Arc and Base</p>
              </div>
              <button onClick={() => copyAddr(sharedAddress, 'EVM')} className="p-2 hover:bg-emerald-100 rounded">
                <svg className="w-5 h-5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="flex justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold text-purple-800 uppercase mb-1">Solana Address</p>
                <p className="font-mono text-sm text-slate-900 break-all">{wallets.solana.address}</p>
                <p className="text-xs text-purple-700 mt-2">Solana Devnet</p>
              </div>
              <button onClick={() => copyAddr(wallets.solana.address, 'Solana')} className="p-2 hover:bg-purple-100 rounded">
                <svg className="w-5 h-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🌐</span>
              <p className="font-semibold text-slate-900 text-sm">Arc Testnet</p>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-slate-500">USDC</p>
                <p className="text-lg font-bold text-slate-900">${parseFloat(balances.arc.usdc).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">EURC</p>
                <p className="text-lg font-bold text-slate-900">€{parseFloat(balances.arc.eurc).toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔵</span>
              <p className="font-semibold text-slate-900 text-sm">Base Sepolia</p>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-slate-500">USDC</p>
                <p className="text-lg font-bold text-slate-900">${parseFloat(balances.base.usdc).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">EURC</p>
                <p className="text-lg font-bold text-slate-900">€{parseFloat(balances.base.eurc).toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">◎</span>
              <p className="font-semibold text-slate-900 text-sm">Solana Devnet</p>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-slate-500">USDC</p>
                <p className="text-lg font-bold text-slate-900">${parseFloat(balances.solana.usdc).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">EURC</p>
                <p className="text-lg font-bold text-slate-900">€{parseFloat(balances.solana.eurc).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button onClick={() => setActiveTab('fund')} className={'flex-1 px-6 py-4 text-sm font-semibold ' + (activeTab === 'fund' ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50' : 'text-slate-500')}>Step 1: Fund</button>
          <button onClick={() => setActiveTab('gateway')} className={'flex-1 px-6 py-4 text-sm font-semibold ' + (activeTab === 'gateway' ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50' : 'text-slate-500')}>Step 2: Gateway</button>
          <button onClick={() => setActiveTab('trade')} className={'flex-1 px-6 py-4 text-sm font-semibold ' + (activeTab === 'trade' ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50' : 'text-slate-500')}>Step 3: Trade</button>
        </div>

        <div className="p-6">
          {activeTab === 'fund' && (
            <div className="space-y-6">
              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">Fund Wallets via API</h3>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <button
                    onClick={() => handleFaucetRequest('ARC-TESTNET', sharedAddress)}
                    disabled={fundingChain === 'ARC-TESTNET'}
                    className="bg-white border-2 border-emerald-600 hover:bg-emerald-50 disabled:opacity-50 rounded-lg py-4 px-4 transition"
                  >
                    <p className="font-semibold text-slate-900 mb-1">
                      {fundingChain === 'ARC-TESTNET' ? 'Funding...' : 'Fund Arc Testnet'}
                    </p>
                    <p className="text-xs text-slate-600">USDC (native) + EURC</p>
                  </button>
                  
                  <button
                    onClick={() => handleFaucetRequest('BASE-SEPOLIA', sharedAddress)}
                    disabled={fundingChain === 'BASE-SEPOLIA'}
                    className="bg-white border-2 border-blue-600 hover:bg-blue-50 disabled:opacity-50 rounded-lg py-4 px-4 transition"
                  >
                    <p className="font-semibold text-slate-900 mb-1">
                      {fundingChain === 'BASE-SEPOLIA' ? 'Funding...' : 'Fund Base Sepolia'}
                    </p>
                    <p className="text-xs text-slate-600">Native + USDC + EURC</p>
                  </button>
                  
                  <button
                    onClick={() => handleFaucetRequest('SOL-DEVNET', wallets.solana.address)}
                    disabled={fundingChain === 'SOL-DEVNET'}
                    className="bg-white border-2 border-purple-600 hover:bg-purple-50 disabled:opacity-50 rounded-lg py-4 px-4 transition"
                  >
                    <p className="font-semibold text-slate-900 mb-1">
                      {fundingChain === 'SOL-DEVNET' ? 'Funding...' : 'Fund Solana Devnet'}
                    </p>
                    <p className="text-xs text-slate-600">Native + USDC + EURC</p>
                  </button>
                </div>

                <div className="border-t border-slate-300 pt-4">
                  <p className="text-xs text-slate-600 mb-3 font-medium">Or use manual faucet links (if rate-limited):</p>
                  <div className="grid grid-cols-3 gap-3">
                    <a href={'https://faucet.circle.com/?address=' + sharedAddress + '&chain=ARC'} target="_blank" rel="noopener noreferrer" className="text-xs text-center bg-white border border-slate-300 rounded-lg py-2 px-3 hover:border-emerald-600 hover:bg-emerald-50 transition">
                      Arc Faucet ↗
                    </a>
                    <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank" rel="noopener noreferrer" className="text-xs text-center bg-white border border-slate-300 rounded-lg py-2 px-3 hover:border-blue-600 hover:bg-blue-50 transition">
                      Base Faucet ↗
                    </a>
                    <a href={'https://faucet.circle.com/?address=' + wallets.solana.address + '&chain=SOL'} target="_blank" rel="noopener noreferrer" className="text-xs text-center bg-white border border-slate-300 rounded-lg py-2 px-3 hover:border-purple-600 hover:bg-purple-50 transition">
                      Solana Faucet ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gateway' && (
            <div className="space-y-6">
              <div className="bg-emerald-50 rounded-lg p-6 border border-emerald-200">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">Circle Gateway Unified Balance</h3>
                    <p className="text-sm text-slate-700">Unify your balances across Arc and Base using Circle Gateway</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-600 mb-1">Gateway Balance</p>
                    <p className="text-2xl font-bold text-slate-900">${parseFloat(gatewayBalances.usdc).toFixed(2)}</p>
                    <p className="text-xs text-slate-500">USDC</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">Deposit to Gateway</h3>
                <form onSubmit={handleGatewayDeposit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Source Chain</label>
                    <select
                      value={selectedChain}
                      onChange={(e) => setSelectedChain(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    >
                      <option value="arc">Arc Testnet</option>
                      <option value="base">Base Sepolia</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Token</label>
                    <select
                      value={depositToken}
                      onChange={(e) => setDepositToken(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    >
                      <option value="USDC">USDC</option>
                      <option value="EURC">EURC</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={depositing}
                    className="w-full px-6 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
                  >
                    {depositing ? 'Depositing...' : 'Deposit to Gateway'}
                  </button>

                  <p className="text-xs text-slate-600">
                    Note: It may take up to 19 minutes for deposits to finalize and appear in your unified balance.
                  </p>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'trade' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-8 text-white">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold mb-2">Ready to Trade</h3>
                    <p className="text-slate-300">
                      Your wallet is funded and unified. Start trading EUR/USD perpetuals now.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 mb-1">Total Balance</p>
                    <p className="text-3xl font-bold">${totalUSDC.toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mt-1">USDC Available</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                    <p className="text-xs text-slate-300 mb-1">Market</p>
                    <p className="text-lg font-semibold">EUR/USD</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                    <p className="text-xs text-slate-300 mb-1">Margin (EURC support coming soon on Gateway)</p>
                    <p className="text-lg font-semibold">USDC</p>
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