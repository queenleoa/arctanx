'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: {
    decimals: 6,
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
  walletSetId: string;
}

interface WalletInterfaceProps {
  wallet: Wallet;
}

export function WalletInterface({ wallet }: WalletInterfaceProps) {
  const [balance, setBalance] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'send' | 'gateway'>('overview');
  const [sendForm, setSendForm] = useState({
    recipient: '',
    amount: '',
  });
  const [sending, setSending] = useState(false);

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(),
  });

  // Fetch balance
  const fetchBalance = async () => {
    try {
      const bal = await publicClient.getBalance({
        address: wallet.address as `0x${string}`,
      });
      setBalance(formatUnits(bal, 6));
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 5000);
    return () => clearInterval(interval);
  }, [wallet]);

  // Handle send USDC
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sendForm.recipient || !sendForm.amount) return;
    
    setSending(true);
    try {
      const response = await fetch('/api/send-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: wallet.walletId,
          recipient: sendForm.recipient,
          amount: sendForm.amount,
        }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        alert(`Error: ${data.error}`);
      } else {
        alert('Transaction sent successfully!');
        setSendForm({ recipient: '', amount: '' });
        fetchBalance();
      }
    } catch (error) {
      console.error('Send error:', error);
      alert('Failed to send transaction');
    } finally {
      setSending(false);
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet.address);
    alert('Address copied!');
  };

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-blue-100 text-sm mb-1">Wallet Address</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm">
                {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
              </p>
              <button
                onClick={copyAddress}
                className="p-1 hover:bg-white/20 rounded transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <div>
          <p className="text-blue-100 text-sm mb-1">Balance</p>
          <p className="text-4xl font-bold">
            {balance !== null ? balance : '...'} <span className="text-2xl">USDC</span>
          </p>
          <p className="text-blue-100 text-sm mt-2">Arc uses USDC as gas token</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'overview'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('send')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'send'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Send
        </button>
        <button
          onClick={() => setActiveTab('gateway')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'gateway'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Gateway
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl p-6 shadow-lg">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Network</p>
                  <p className="text-xl font-bold text-gray-900">Arc Testnet</p>
                </div>
                <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>

            <a
              href={`https://faucet.circle.com/?address=${wallet.address}&chain=ARC`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 px-6 rounded-xl text-center font-semibold hover:from-green-700 hover:to-emerald-700 transition shadow-lg"
            >
              Get Testnet USDC from Faucet →
            </a>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">About Developer-Controlled Wallets</h3>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>• Your wallet is tied to your login account</li>
                <li>• No seed phrases to manage</li>
                <li>• Keys are secured by Circle's MPC infrastructure</li>
                <li>• Access your wallet from any device</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'send' && (
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipient Address
              </label>
              <input
                type="text"
                value={sendForm.recipient}
                onChange={(e) => setSendForm({ ...sendForm, recipient: e.target.value })}
                placeholder="0x..."
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                Available: {balance || '0'} USDC
              </p>
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg"
            >
              {sending ? 'Sending...' : 'Send USDC'}
            </button>
          </form>
        )}

        {activeTab === 'gateway' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">Circle Gateway</h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Unified USDC balance across all chains with instant &lt;500ms transfers.
                  </p>
                  <div className="space-y-2 text-sm text-gray-700">
                    <p className="font-medium">✅ Supported Chains:</p>
                    <ul className="ml-4 space-y-1">
                      <li>• Arc Testnet (Active)</li>
                      <li>• Ethereum</li>
                      <li>• Arbitrum</li>
                      <li>• Base</li>
                      <li>• Avalanche</li>
                      <li>• OP Mainnet</li>
                      <li>• Polygon PoS</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-gray-700">
                <strong>Coming Soon:</strong> Instant cross-chain transfers without bridging.
                Your USDC balance will be instantly available on any supported chain.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}