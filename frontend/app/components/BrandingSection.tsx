'use client';

export function BrandingSection() {
  return (
    <div className="flex flex-col justify-center px-12 py-16">
      {/* Logo and Title */}
      <div className="mb-12">
        <div className="inline-flex items-center gap-3 mb-6">
          <div className="w-14 h-14 bg-slate-900 rounded-lg flex items-center justify-center">
            <span className="text-white text-2xl font-bold">x</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-900">arctan(x)</h1>
            <p className="text-sm text-slate-600 font-medium mt-1">Institutional Stablecoin Infrastructure</p>
          </div>
        </div>
      </div>

      {/* Main Value Proposition */}
      <div className="space-y-6 mb-12">
        <h2 className="text-3xl font-semibold text-slate-900 leading-tight">
          Chain-Agnostic Stablecoin<br />Forex Derivatives Exchange
        </h2>
        <p className="text-lg text-slate-700 leading-relaxed">
          Enterprise-grade infrastructure for stablecoin forex perpetual futures 
          with Circle Gateway unified balances across Arc and Base.
        </p>
      </div>

      {/* Key Features */}
      <div className="space-y-4 mb-12">
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5 flex-shrink-0">
            <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Unified Multi-Chain Address</h3>
            <p className="text-sm text-slate-600 mt-1">
              One address works on both Arc Testnet and Base Sepolia with instant balance synchronization
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5 flex-shrink-0">
            <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Circle Gateway Native</h3>
            <p className="text-sm text-slate-600 mt-1">
              Sub-500ms cross-chain USDC transfers using Circle's CCTP protocol - no bridges
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5 flex-shrink-0">
            <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Enterprise MPC Security</h3>
            <p className="text-sm text-slate-600 mt-1">
              Developer-controlled wallets secured by Circle's institutional-grade MPC infrastructure
            </p>
          </div>
        </div>
      </div>

      {/* Technical Specs */}
      <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
          Technical Specifications
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500 mb-1">Networks</p>
            <p className="font-medium text-slate-900">Arc · Base</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Assets</p>
            <p className="font-medium text-slate-900">USDC · EURC</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Settlement</p>
            <p className="font-medium text-slate-900">Sub-second finality</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Address Type</p>
            <p className="font-medium text-slate-900">Unified EVM</p>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="mt-12 pt-8 border-t border-slate-200">
        <p className="text-xs text-slate-500">
          Built for hackathon demonstration · Powered by Circle Developer-Controlled Wallets 
          and Arc Testnet
        </p>
      </div>
    </div>
  );
}
