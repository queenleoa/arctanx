'use client';

import { useUser, UserButton } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { WalletInterface } from '@/app/components/WalletInterface';

interface Wallet {
  address: string;
  walletId: string;
  walletSetId: string;
}

export default function Home() {
  const { user, isLoaded } = useUser();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && user) {
      loadOrCreateWallet();
    }
  }, [isLoaded, user]);

  const loadOrCreateWallet = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Check if wallet exists in Clerk metadata
      const existingWallet = user?.publicMetadata?.wallet as Wallet | undefined;
      
      if (existingWallet?.address) {
        setWallet(existingWallet);
        setLoading(false);
        return;
      }

      // Create new wallet
      const response = await fetch('/api/create-wallet', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      // Save wallet to Clerk metadata
      await fetch('/api/save-wallet-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      setWallet(data);
    } catch (err: any) {
      console.error('Wallet error:', err);
      setError(err.message || 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white text-xl font-bold">
              x
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">arctan(x)</h1>
              <p className="text-gray-600">Institutional Stablecoin Forex DEX</p>
            </div>
          </div>
          
          <UserButton afterSignOutUrl="/" />
        </div>

        {/* Wallet Section */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Setting up your wallet...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-red-800">{error}</p>
            <button
              onClick={loadOrCreateWallet}
              className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        ) : wallet ? (
          <WalletInterface wallet={wallet} />
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-600">Initializing...</p>
          </div>
        )}
      </div>
    </main>
  );
}