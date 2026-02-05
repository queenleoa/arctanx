'use client';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-8 py-16">
        {/* Header */}
        <div className="mb-20">
          <div className="inline-flex items-center gap-3">
            <div className="w-16 h-16 bg-slate-900 rounded-xl flex items-center justify-center">
              <span className="text-white text-3xl font-bold">x</span>
            </div>
            <div>
              <h1 className="text-5xl font-bold text-slate-900">arctan(x)</h1>
              <p className="text-sm text-slate-600 font-medium mt-1">Institutional-grade Stablepair Forex Derivatives</p>
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-20">
          <div>
            <h2 className="text-5xl font-bold text-slate-900 leading-tight mb-6">
              Capital-Efficient<br/> Chain-Agnostic<br />Forex Perpetuals<br />
            </h2>
            <p className="text-xl text-slate-700 leading-relaxed mb-8">
              Redefining efficiency, speed, auditability, and trust for the quadrillion dollar Forex derivatives market 
            </p>
            <button
              onClick={onGetStarted}
              className="px-8 py-4 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition text-lg shadow-lg"
            >
              Get Started →
            </button>
          </div>

          <div className="space-y-6">
            {/* Key Features */}
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Unified Multi-Chain Balance</h3>
                  <p className="text-sm text-slate-600">
                    One wallet address across EVM chains (Arc + Base) plus Solana with instant balance synchronization via Circle Gateway CCTP
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Multi-Stablecoin Support</h3>
                  <p className="text-sm text-slate-600">
                    Trade USDC and EURC forex perpetuals with sub-500ms cross-chain transfers using Circle's native CCTP protocol
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Enterprise MPC Security</h3>
                  <p className="text-sm text-slate-600">
                    Developer-controlled wallets secured by Circle's institutional-grade multi-party computation infrastructure
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Specs */}
        <div className="bg-slate-900 rounded-2xl p-8 text-white">
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-6 text-slate-400">
            Technical Specifications
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-slate-400 mb-2 text-sm">Test Networks</p>
              <p className="font-semibold text-lg">Arc · Base · Solana</p>
            </div>
            <div>
              <p className="text-slate-400 mb-2 text-sm">Demo Assets</p>
              <p className="font-semibold text-lg">USDC · EURC</p>
            </div>
            <div>
              <p className="text-slate-400 mb-2 text-sm">Settlement Time</p>
              <p className="font-semibold text-lg">Sub-second Finality</p>
            </div>
            <div>
              <p className="text-slate-400 mb-2 text-sm">Perps Protocol</p>
              <p className="font-semibold text-lg">Orderbook + RFQ</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-slate-200 text-center">
          <p className="text-sm text-slate-500">
            Built for EthGlobal HackMoney 2026 · Powered by Circle Wallets, Circle Gateway, Arc Testnet, Base Sepolia, & Solana Devnet
          </p>
        </div>
      </div>
    </div>
  );
}