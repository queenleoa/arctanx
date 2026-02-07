'use client';
import Image from "next/image";

import { UserButton, useUser } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { MultiChainWalletInterface } from '@/app/components/MultiChainWalletInterface';

interface WalletData {
  arc: { address: string; walletId: string; blockchain: string };
  base: { address: string; walletId: string; blockchain: string };
  avax: { address: string; walletId: string; blockchain: string };
  solana: { address: string; walletId: string; blockchain: string };
}

export function WalletDashboard() {
  const { user, isLoaded } = useUser();
  const [wallets, setWallets] = useState<WalletData | null>(null);
  const [walletSetId, setWalletSetId] = useState<string | null>(null);
  const [sharedAddress, setSharedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && user) {
      loadOrCreateWallets();
    }
  }, [isLoaded, user]);

  const loadOrCreateWallets = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check if wallets exist in Clerk metadata
      const existingWallets = user?.publicMetadata?.wallets as WalletData | undefined;
      const existingWalletSetId = user?.publicMetadata?.walletSetId as string | undefined;
      const existingSharedAddress = user?.publicMetadata?.sharedAddress as string | undefined;

      if (existingWallets && existingWalletSetId && existingSharedAddress) {
        setWallets(existingWallets);
        setWalletSetId(existingWalletSetId);
        setSharedAddress(existingSharedAddress);
        setLoading(false);
        return;
      }

      // Create new wallets
      const response = await fetch('/api/create-wallet', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      // Save wallets to Clerk metadata
      await fetch('/api/save-wallet-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      setWallets(data.wallets);
      setWalletSetId(data.walletSetId);
      setSharedAddress(data.sharedAddress);
    } catch (err: any) {
      console.error('Wallet error:', err);
      setError(err.message || 'Failed to load wallets');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 flex justify-between items-center">
        {/* Left: logo + text */}
        <div className="flex items-center gap-4">
          {/* Wordmark + subtitle */}
          <div className="flex flex-col">
            <Image
              src="/logo-image.png"
              alt="Arctan wordmark"
              width={160}
              height={32}
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Right: user avatar (unchanged, pinned) */}
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-10 h-10",
            },
          }}
        />
      </div>

      {/* Wallet Section */}
      {loading ? (
        <div className="text-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Setting up your unified wallet...</p>
          <p className="text-sm text-slate-500 mt-2">Creating addresses on Arc, Base, and Solana</p>
        </div>
      ) : error ? (
        <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-800 font-medium mb-4">{error}</p>
          <button
            onClick={loadOrCreateWallets}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold transition"
          >
            Try Again
          </button>
        </div>
      ) : wallets && walletSetId && sharedAddress ? (
        <MultiChainWalletInterface
          wallets={wallets}
          walletSetId={walletSetId}
          sharedAddress={sharedAddress}
        />
      ) : (
        <div className="text-center py-20">
          <p className="text-slate-600 font-medium">Initializing...</p>
        </div>
      )}
    </div>
  );
}