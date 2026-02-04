'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import Image from 'next/image';

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
    default: { http: ['https://arc-testnet.rpc.caldera.xyz/http'] },
    public: { http: ['https://arc-testnet.rpc.caldera.xyz/http'] },
  },
} as const;

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

interface Wallet {
  address: string;
  walletId: string;
}

export default function Home() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const createWallet = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/create-wallet', {
        method: 'POST',
      });
      const data = await response.json();
      setWallet(data);
      localStorage.setItem('wallet', JSON.stringify(data));
    } catch (error) {
      console.error('Error creating wallet:', error);
    }
    setLoading(false);
  };

  const fetchBalance = async () => {
    if (!wallet?.address) return;
    
    try {
      const balance = await publicClient.getBalance({
        address: wallet.address as `0x${string}`,
      });
      setBalance(formatUnits(balance, 6));
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('wallet');
    if (saved) {
      setWallet(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    if (wallet) {
      fetchBalance();
      const interval = setInterval(fetchBalance, 5000);
      return () => clearInterval(interval);
    }
  }, [wallet]);

  return (
    <main className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Image src="/logo-image.png" alt="arctan(x)" width={48} height={48} />
          <h1 className="text-3xl font-bold">arctan(x)</h1>
        </div>

        <div className="max-w-md">
          <h2 className="text-2xl font-bold mb-4">Arc Testnet Wallet</h2>
          
          {!wallet ? (
            <button
              onClick={createWallet}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Wallet'}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Address</p>
                <p className="font-mono text-sm break-all">{wallet.address}</p>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">USDC Balance</p>
                <p className="text-2xl font-bold">
                  {balance !== null ? `${balance} USDC` : 'Loading...'}
                </p>
              </div>

              <a
                href={`https://faucet.circle.com/?address=${wallet.address}&chain=ARC`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-green-600 text-white py-3 px-4 rounded-lg text-center hover:bg-green-700"
              >
                Get Testnet USDC
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}