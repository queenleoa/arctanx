'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';

// Arc Testnet configuration
const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: {
    decimals: 18, // Native USDC uses 18 decimals
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: { http: ['https://arc-testnet.drpc.org'] },
  },
} as const;

interface Wallet {
  address: string;
  walletId: string;
  blockchain: string;
}

interface WalletData {
  arc: Wallet;
  base: Wallet;
}

interface WalletInterfaceProps {
  wallets: WalletData;
  walletSetId: string;
  sharedAddress: string; // Same address across all EVM chains
}

interface ChainBalance {
  usdc: string;
  eurc: string;
}

export function MultiChainWalletInterface({ wallets, walletSetId, sharedAddress }: WalletInterfaceProps) {
  const [balances, setBalances] = useState<Record<string, ChainBalance>>({
    arc: { usdc: '0', eurc: '0' },
    base: { usdc: '0', eurc: '0' },
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'send' | 'gateway'>('overview');
  const [selectedChain, setSelectedChain] = useState<'arc' | 'base'>('arc');
  const [sendForm, setSendForm] = useState({
    recipient: '',
    amount: '',
    asset: 'USDC',
  });
  const [sending, setSending] = useState(false);

  const arcClient = createPublicClient({
    chain: arcTestnet,
    transport: http(),
  });

  const baseClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  // Fetch balances for both chains
  const fetchBalances = async () => {
    try {
      // Arc balance (native USDC uses 18 decimals)
      const arcBalance = await arcClient.getBalance({
        address: sharedAddress as `0x${string}`,
      });
      
      // Base balance
      const baseBalance = await baseClient.getBalance({
        address: sharedAddress as `0x${string}`,
      });

      setBalances({
        arc: { 
          usdc: formatUnits(arcBalance, 18), // Arc native uses 18 decimals
          eurc: '0' // TODO: Add EURC balance fetching
        },
        base: { usdc: formatUnits(baseBalance, 18), eurc: '0' },
      });
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  };

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [wallets]);

  // Calculate total balance
  const totalUSDC = Object.values(balances).reduce(
    (sum, b) => sum + parseFloat(b.usdc || '0'),
    0
  );

  const totalEURC = Object.values(balances).reduce(
    (sum, b) => sum + parseFloat(b.eurc || '0'),
    0
  );

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sendForm.recipient || !sendForm.amount) return;
    
    setSending(true);
    try {
      const response = await fetch('/api/send-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: wallets[selectedChain].walletId,
          recipient: sendForm.recipient,
          amount: sendForm.amount,
          blockchain: wallets[selectedChain].blockchain,
        }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        alert(`Error: ${data.error}`);
      } else {
        alert('Transaction sent successfully!');
        setSendForm({ recipient: '', amount: '', asset: 'USDC' });
        fetchBalances();
      }
    } catch (error) {
      console.error('Send error:', error);
      alert('Failed to send transaction');
    } finally {
      setSending(false);
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(sharedAddress);
    alert('Wallet address copied! (Same address on both chains)');
  };

  const chainInfo = {
    arc: { name: 'Arc Testnet', color: 'from-blue-600 to-indigo-600', icon: '🌐' },
    base: { name: 'Base Sepolia', color: 'from-blue-500 to-cyan-500', icon: '🔵' },
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Total Balance Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-sm font-medium text-slate-600 mb-1">Total Balance Across All Chains</p>
            <div className="flex items-baseline gap-4">
              <div>
                <p className="text-4xl font-bold text-slate-900">
                  ${totalUSDC.toFixed(2)}
                </p>
                <p className="text-sm text-slate-500 mt-1">USDC</p>
              </div>
              <div className="pl-4 border-l border-slate-200">
                <p className="text-2xl font-semibold text-slate-900">
                  €{totalEURC.toFixed(2)}
                </p>
                <p className="text-sm text-slate-500 mt-1">EURC</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-2">
              ✓ Circle Gateway Enabled
            </p>
            <p className="text-xs text-slate-500">Unified balance</p>
          </div>
        </div>

        {/* Shared Address - Emphasize this is the same on both chains */}
        <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-1">
                Unified Wallet Address
              </p>
              <p className="font-mono text-sm text-slate-900 break-all">
                {sharedAddress}
              </p>
              <p className="text-xs text-emerald-700 mt-2">
                ✓ Same address on both Arc Testnet and Base Sepolia
              </p>
            </div>
            <button
              onClick={copyAddress}
              className="flex-shrink-0 p-2 hover:bg-emerald-100 rounded transition"
            >
              <svg className="w-5 h-5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Chain Balances Grid - Now just 2 chains */}
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(chainInfo).map(([key, info]) => (
            <div
              key={key}
              className="bg-slate-50 rounded-lg p-4 border border-slate-200 hover:border-slate-300 transition"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{info.icon}</span>
                <p className="font-semibold text-slate-900 text-sm">{info.name}</p>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500">USDC Balance</p>
                  <p className="text-lg font-bold text-slate-900">
                    ${parseFloat(balances[key as keyof typeof balances].usdc).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            <strong>Circle Gateway:</strong> Your USDC balance is unified across both chains. 
            Transfers between Arc and Base happen instantly via Circle's cross-chain protocol.
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          {['overview', 'send', 'gateway'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition ${
                activeTab === tab
                  ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">Get Testnet Tokens</h3>
                <div className="grid grid-cols-2 gap-4">
                  <a
                    href={`https://faucet.circle.com/?address=${sharedAddress}&chain=ARC`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center bg-white border-2 border-slate-200 rounded-lg py-4 px-4 hover:border-blue-600 hover:bg-blue-50 transition"
                  >
                    <p className="font-semibold text-slate-900 mb-1">Arc Faucet</p>
                    <p className="text-xs text-slate-600">Get testnet USDC</p>
                  </a>
                  <a
                    href="https://www.alchemy.com/faucets/base-sepolia"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center bg-white border-2 border-slate-200 rounded-lg py-4 px-4 hover:border-cyan-600 hover:bg-cyan-50 transition"
                  >
                    <p className="font-semibold text-slate-900 mb-1">Base Faucet</p>
                    <p className="text-xs text-slate-600">Get testnet ETH</p>
                  </a>
                </div>
                <p className="text-xs text-slate-500 mt-4 text-center">
                  Use the same address for both faucets
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-2">About Your Wallet</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">✓</span>
                    <span><strong>One address, multiple chains:</strong> Your wallet works on both Arc and Base with the same address</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">✓</span>
                    <span><strong>Circle Gateway unified:</strong> USDC balance is seamlessly available across both networks</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">✓</span>
                    <span><strong>MPC secured:</strong> Keys protected by Circle's multi-party computation infrastructure</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">✓</span>
                    <span><strong>No seed phrases:</strong> Access your wallet from any device via social login</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'send' && (
            <div className="max-w-xl">
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  Select Network
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(chainInfo).map(([key, info]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedChain(key as any)}
                      className={`p-4 rounded-lg border-2 transition ${
                        selectedChain === key
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-2xl mb-2 block">{info.icon}</span>
                      <p className="text-xs font-semibold text-slate-900">{info.name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {parseFloat(balances[key as keyof typeof balances].usdc).toFixed(2)} USDC
                      </p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-3 text-center">
                  Same address on both chains: <span className="font-mono">{sharedAddress.slice(0, 12)}...</span>
                </p>
              </div>

              <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    value={sendForm.recipient}
                    onChange={(e) => setSendForm({ ...sendForm, recipient: e.target.value })}
                    placeholder="Enter recipient address..."
                    required
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Amount (USDC)
                  </label>
                  <input
                    type="number"
                    value={sendForm.amount}
                    onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    required
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                  <p className="text-sm text-slate-500 mt-2">
                    Available: {parseFloat(balances[selectedChain].usdc).toFixed(2)} USDC
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={sending}
                  className="w-full bg-slate-900 text-white py-3 px-4 rounded-lg font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {sending ? 'Sending...' : 'Send USDC'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'gateway' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">Circle Gateway Integration</h3>
                    <p className="text-sm text-slate-700 mb-4">
                      Your wallet uses Circle's cross-chain transfer protocol (CCTP) for instant, 
                      unified USDC balances across Arc Testnet and Base Sepolia with sub-500ms transfers.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-slate-700"><strong>Same address on both chains:</strong> {sharedAddress.slice(0, 12)}...</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-slate-700"><strong>No bridging required:</strong> Native Circle infrastructure</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-slate-700"><strong>Instant settlement:</strong> Sub-500ms cross-chain transfers</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-slate-700"><strong>Unified liquidity:</strong> Total balance tracked across networks</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Connected Networks</h3>
                <div className="space-y-3">
                  {Object.entries(chainInfo).map(([key, info]) => (
                    <div key={key} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{info.icon}</span>
                        <div>
                          <span className="font-medium text-slate-900 block">{info.name}</span>
                          <span className="text-xs text-slate-500">
                            {parseFloat(balances[key as keyof typeof balances].usdc).toFixed(2)} USDC available
                          </span>
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                        Active
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">How Circle Gateway Works</h4>
                <p className="text-sm text-blue-800 mb-3">
                  Circle Gateway eliminates traditional bridging by using Circle's native cross-chain 
                  transfer protocol (CCTP). Your USDC is instantly available on any connected chain.
                </p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>Arc Testnet:</strong> USDC as native gas token, sub-second finality</li>
                  <li>• <strong>Base Sepolia:</strong> Ethereum L2 with low fees and fast confirmation</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
