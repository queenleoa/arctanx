'use client';

import { SignedIn, SignedOut } from '@clerk/nextjs';
import { useState } from 'react';
import { LandingPage } from '@/app/components/LandingPage';
import { SignInPage } from '@/app/components/SignInPage';
import { WalletDashboard } from '@/app/components/WalletDashboard';

export default function Home() {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <main className="min-h-screen bg-slate-50">
      <SignedOut>
        {!showSignIn ? (
          <LandingPage onGetStarted={() => setShowSignIn(true)} />
        ) : (
          <SignInPage />
        )}
      </SignedOut>

      <SignedIn>
        <WalletDashboard />
      </SignedIn>
    </main>
  );
}