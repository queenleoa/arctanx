'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { Connection, PublicKey } from '@solana/web3.js';

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

export function MultiChainWalletInterface({ wallets, walletSetId, sharedAddress }: Props) {
  const [balances, setBalances] = useState({
    arc: { usdc: '0', eurc: '0' },
    base: { usdc: '0', eurc: '0' },
    solana: { usdc: '0', eurc: '0' },
  });
  
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedChain, setSelectedChain] = useState('arc');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('USDC');
  const [sending, setSending] = useState(false);

  const arcClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const baseClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const solanaConnection = new Connection('https://api.devnet.solana.com');

  const fetchBalances = async () => {
    try {
      const arcBal = await arcClient.getBalance({ address: sharedAddress as `0x${string}` });
      
      let baseBal = BigInt(0);
      try {
        baseBal = await baseClient.readContract({
          address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [sharedAddress as `0x${string}`],
        }) as bigint;
      } catch (e) {
        console.error('Base error:', e);
      }

      let solBal = '0';
      try {
        const pk = new PublicKey(wallets.solana.address);
        const accounts = await solanaConnection.getParsedTokenAccountsByOwner(
          pk,
          { mint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU') }
        );
        if (accounts.value.length > 0) {
          solBal = accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount?.toString() || '0';
        }
      } catch (e) {
        console.error('Solana error:', e);
      }

      setBalances({
        arc: { usdc: formatUnits(arcBal, 18), eurc: '0' },
        base: { usdc: formatUnits(baseBal, 6), eurc: '0' },
        solana: { usdc: solBal, eurc: '0' },
      });
    } catch (e) {
      console.error('Fetch error:', e);
    }
  };

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, []);

  const totalUSDC = parseFloat(balances.arc.usdc) + parseFloat(balances.base.usdc) + parseFloat(balances.solana.usdc);
  const totalEURC = parseFloat(balances.arc.eurc) + parseFloat(balances.base.eurc) + parseFloat(balances.solana.eurc);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !amount) return;
    
    setSending(true);
    try {
      const chain = selectedChain as keyof WalletData;
      const res = await fetch('/api/send-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: wallets[chain].walletId,
          recipient,
          amount,
          blockchain: wallets[chain].blockchain,
          asset,
        }),
      });
      
      const data = await res.json();
      if (data.error) {
        alert('Error: ' + data.error);
      } else {
        alert('Transaction sent!');
        setRecipient('');
        setAmount('');
        fetchBalances();
      }
    } catch (err) {
      alert('Failed to send');
    } finally {
      setSending(false);
    }
  };

  const copyAddr = (addr: string, name: string) => {
    navigator.clipboard.writeText(addr);
    alert(name + ' address copied!');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-sm font-medium text-slate-600 mb-1">Total Balance Across All Chains</p>
            <div className="flex items-baseline gap-4">
              <div>
                <p className="text-4xl font-bold text-slate-900">${totalUSDC.toFixed(2)}</p>
                <p className="text-sm text-slate-500 mt-1">USDC</p>
              </div>
              <div className="pl-4 border-l border-slate-200">
                <p className="text-2xl font-semibold text-slate-900">${totalEURC.toFixed(2)}</p>
                <p className="text-sm text-slate-500 mt-1">EURC</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-emerald-600 uppercase mb-2">Circle Gateway</p>
            <p className="text-xs text-slate-500">Unified</p>
          </div>
        </div>

        <div className="space-y-3 mb-4">
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
            <div>
              <p className="text-xs text-slate-500">USDC</p>
              <p className="text-lg font-bold text-slate-900">${parseFloat(balances.arc.usdc).toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔵</span>
              <p className="font-semibold text-slate-900 text-sm">Base Sepolia</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">USDC</p>
              <p className="text-lg font-bold text-slate-900">${parseFloat(balances.base.usdc).toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">◎</span>
              <p className="font-semibold text-slate-900 text-sm">Solana Devnet</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">USDC</p>
              <p className="text-lg font-bold text-slate-900">${parseFloat(balances.solana.usdc).toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button onClick={() => setActiveTab('overview')} className={'flex-1 px-6 py-4 text-sm font-semibold ' + (activeTab === 'overview' ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50' : 'text-slate-500')}>Overview</button>
          <button onClick={() => setActiveTab('send')} className={'flex-1 px-6 py-4 text-sm font-semibold ' + (activeTab === 'send' ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50' : 'text-slate-500')}>Send</button>
          <button onClick={() => setActiveTab('gateway')} className={'flex-1 px-6 py-4 text-sm font-semibold ' + (activeTab === 'gateway' ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50' : 'text-slate-500')}>Gateway</button>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">Get Testnet Tokens</h3>
                <div className="grid grid-cols-3 gap-4">
                  <a href={'https://faucet.circle.com/?address=' + sharedAddress + '&chain=ARC'} target="_blank" rel="noopener noreferrer" className="block text-center bg-white border-2 border-slate-200 rounded-lg py-4 px-4 hover:border-blue-600">
                    <p className="font-semibold text-slate-900 mb-1">Arc Faucet</p>
                    <p className="text-xs text-slate-600">Get USDC</p>
                  </a>
                  <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank" rel="noopener noreferrer" className="block text-center bg-white border-2 border-slate-200 rounded-lg py-4 px-4 hover:border-cyan-600">
                    <p className="font-semibold text-slate-900 mb-1">Base Faucet</p>
                    <p className="text-xs text-slate-600">Get ETH</p>
                  </a>
                  <a href="https://faucet.solana.com/" target="_blank" rel="noopener noreferrer" className="block text-center bg-white border-2 border-slate-200 rounded-lg py-4 px-4 hover:border-purple-600">
                    <p className="font-semibold text-slate-900 mb-1">Solana Faucet</p>
                    <p className="text-xs text-slate-600">Get SOL</p>
                  </a>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'send' && (
            <form onSubmit={handleSend} className="max-w-xl space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Network</label>
                <select value={selectedChain} onChange={(e) => setSelectedChain(e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-lg">
                  <option value="arc">Arc Testnet</option>
                  <option value="base">Base Sepolia</option>
                  <option value="solana">Solana Devnet</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Asset</label>
                <select value={asset} onChange={(e) => setAsset(e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-lg">
                  <option value="USDC">USDC</option>
                  <option value="EURC">EURC</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Recipient</label>
                <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Address..." required className="w-full px-4 py-3 border border-slate-300 rounded-lg" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Amount</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" step="0.01" min="0" required className="w-full px-4 py-3 border border-slate-300 rounded-lg" />
              </div>

              <button type="submit" disabled={sending} className="w-full bg-slate-900 text-white py-3 px-4 rounded-lg font-semibold hover:bg-slate-800 disabled:opacity-50">
                {sending ? 'Sending...' : 'Send ' + asset}
              </button>
            </form>
          )}

          {activeTab === 'gateway' && (
            <div className="space-y-6">
              <div className="bg-emerald-50 rounded-lg p-6 border border-emerald-200">
                <h3 className="font-bold text-slate-900 mb-2">Circle Gateway</h3>
                <p className="text-sm text-slate-700">USDC unified across Arc and Base via CCTP with sub-500ms transfers.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}