'use client';
import Image from "next/image";

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-8 py-16">
        {/* Header */}
        <div className="mb-20">
          <div className="inline-flex items-center gap-5">
            <div>
              {/* Logo instead of arctan(x) */}
              <div className="h-[3.5rem] flex items-center">
                <Image
                  src="/logo-image.png"
                  alt="Arctan wordmark"
                  width={220}
                  height={56}
                  className="object-contain"
                  priority
                />
              </div>

              <p className="text-sm text-slate-600 font-medium mt-8">
                Institutional-grade Stablepair Forex Derivatives
              </p>
            </div>
          </div>
        </div>


        {/* Hero Section */}
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-20">
          <div>
            <h2 className="text-5xl font-bold text-slate-900 leading-tight mb-6">
              Capital-Efficient<br /> Chain-Agnostic<br />Forex Perpetuals<br />
            </h2>
            <p className="text-xl text-slate-700 leading-relaxed mb-8">
              Redefining efficiency, speed, auditability, and trust for the quadrillion dollar Forex derivatives market
            </p>
            <button
              onClick={onGetStarted}
              className="px-8 py-4 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition text-lg shadow-lg"
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
                    <circle cx="12" cy="12" r="2" strokeWidth={2} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v6M12 16v6M2 12h6M16 12h6" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Unified Multi-Chain Balance</h3>
                  <p className="text-sm text-slate-600">
                    Instant balance synchronization via <b>Circle Gateway</b>
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Cross-Chain Collateral Rehypothecation</h3>
                  <p className="text-sm text-slate-600">
                    <b>CCTP</b> and <b>virtual accounting</b> maiximize capital efficiency
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10h16M6 10v7M10 10v7M14 10v7M18 10v7M4 17h16" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l9-5 9 5" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Institutional-grade Forex Conversion Rates</h3>
                  <p className="text-sm text-slate-600">
                    <b>StableFX</b> for settlements, multi-currency margins, and hedging.
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
              <p className="font-semibold text-lg">Arc · Avax · Base · Solana</p>
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
              <p className="text-slate-400 mb-2 text-sm">Protocol</p>
              <p className="font-semibold text-lg">Orderbook + RFQ</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-slate-200 text-center">
          <p className="text-sm text-slate-500">
            Built for EthGlobal HackMoney 2026 · Powered by Circle Wallets, Circle Gateway, Arc Testnet, Avalanche Fuji, Base Sepolia, & Solana Devnet
          </p>
        </div>
      </div>
    </div>
  );
}