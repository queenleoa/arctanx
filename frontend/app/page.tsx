'use client';

import { SignIn, SignedIn, SignedOut, UserButton, useUser } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { BrandingSection } from '@/app/components/BrandingSection';
import { MultiChainWalletInterface } from '@/app/components/MultiChainWalletInterface';

interface WalletData {
  arc: { address: string; walletId: string; blockchain: string };
  base: { address: string; walletId: string; blockchain: string };
}

export default function Home() {
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
    <main className="min-h-screen bg-slate-50">
      <SignedOut>
        {/* Landing Page with Branding + Sign In */}
        <div className="min-h-screen grid lg:grid-cols-2">
          {/* Left Side - Branding */}
          <div className="bg-white border-r border-slate-200 flex items-center">
            <BrandingSection />
          </div>

          {/* Right Side - Clerk Sign In */}
          <div className="flex items-center justify-center p-8 bg-slate-50">
            <div className="w-full max-w-md">
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  Get Started
                </h2>
                <p className="text-slate-600">
                  Sign in to access your institutional wallet
                </p>
              </div>
              <SignIn 
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    card: "shadow-lg border border-slate-200 rounded-xl",
                    headerTitle: "text-slate-900 font-semibold",
                    headerSubtitle: "text-slate-600",
                    socialButtonsBlockButton: "border-slate-300 hover:bg-slate-50 text-slate-700 font-medium",
                    formButtonPrimary: "bg-slate-900 hover:bg-slate-800 text-white font-semibold",
                    formFieldInput: "border-slate-300 focus:border-slate-900 focus:ring-slate-900",
                    footerActionLink: "text-slate-900 hover:text-slate-700 font-medium",
                  },
                }}
              />
            </div>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        {/* Authenticated Dashboard */}
        <div className="p-8">
          {/* Header */}
          <div className="max-w-7xl mx-auto mb-8 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center">
                <span className="text-white text-xl font-bold">x</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">arctan(x)</h1>
                <p className="text-sm text-slate-600">Institutional Wallet Dashboard</p>
              </div>
            </div>
            
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
              <p className="text-sm text-slate-500 mt-2">Creating one address on Arc Testnet and Base Sepolia</p>
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
      </SignedIn>
    </main>
  );
}
