'use client';

import { useState, useEffect, useCallback } from 'react';

interface StableFXSwapProps {
  walletAddress: string; // Arc testnet wallet address
  arcWalletId: string;   // Circle wallet ID for Arc
  usdcBalance: number;   // Arc wallet USDC balance specifically
  eurcBalance: number;   // Arc wallet EURC balance specifically
  onRefreshBalances: () => void;
}

interface Quote {
  id: string;
  rate: string;
  from: { currency: string; amount: string };
  to: { currency: string; amount: string };
  timestamp: string;
  expiry: string;
  fee: { currency: string; amount: string };
}

type SwapStep = 
  | 'input'           // User enters amount
  | 'quoting'         // Fetching quote
  | 'quote-ready'     // Quote received, awaiting confirmation
  | 'creating-trade'  // Creating trade
  | 'signing'         // Signing trade intent
  | 'fetching-contract-id' // Fetching contractTradeId
  | 'funding'         // Funding the trade
  | 'complete'        // Trade complete
  | 'error';          // Error occurred

function ExplorerIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export function StableFXSwap({ 
  walletAddress, 
  arcWalletId, 
  usdcBalance, 
  eurcBalance,
  onRefreshBalances 
}: StableFXSwapProps) {
  const [fromCurrency, setFromCurrency] = useState<'USDC' | 'EURC'>('USDC');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [step, setStep] = useState<SwapStep>('input');
  const [error, setError] = useState('');
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [txHashes, setTxHashes] = useState<{ approval?: string; funding?: string }>({});
  const [permit2Approved, setPermit2Approved] = useState<Record<string, boolean>>({ USDC: false, EURC: false });
  const [checkingPermit2, setCheckingPermit2] = useState(true);

  const toCurrency = fromCurrency === 'USDC' ? 'EURC' : 'USDC';
  const availableBalance = fromCurrency === 'USDC' ? usdcBalance : eurcBalance;

  // Check Permit2 allowance for BOTH currencies on mount
  useEffect(() => {
    checkPermit2AllowanceBoth();
  }, [walletAddress]);

  const checkPermit2AllowanceBoth = async () => {
    setCheckingPermit2(true);
    try {
      const results: Record<string, boolean> = { USDC: false, EURC: false };
      for (const currency of ['USDC', 'EURC'] as const) {
        try {
          const res = await fetch('/api/stablefx/check-permit2-allowance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress, currency }),
          });
          const data = await res.json();
          results[currency] = data.hasAllowance || false;
        } catch (err) {
          console.error(`Error checking Permit2 for ${currency}:`, err);
        }
      }
      setPermit2Approved(results);
    } finally {
      setCheckingPermit2(false);
    }
  };

  const grantPermit2Allowance = async (currency: 'USDC' | 'EURC') => {
    setStep('signing');
    setError('');
    
    try {
      const res = await fetch('/api/stablefx/grant-permit2-allowance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          walletId: arcWalletId,
          currency,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to grant Permit2 allowance');
      }

      setPermit2Approved(prev => ({ ...prev, [currency]: true }));
      alert(`✅ Permit2 allowance granted for ${currency}! You can now execute swaps.`);
      setStep('input');
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  };

  const requestQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (parseFloat(amount) > availableBalance) {
      setError(`Insufficient ${fromCurrency} balance on Arc wallet`);
      return;
    }

    setStep('quoting');
    setError('');
    setQuote(null);

    try {
      const res = await fetch('/api/stablefx/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromCurrency,
          toCurrency,
          amount,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to get quote');
      }

      setQuote(data.quote);
      setStep('quote-ready');
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  };

  const executeSwap = async () => {
    if (!quote) return;

    setStep('creating-trade');
    setError('');

    try {
      // Step 1: Create trade
      console.log('[swap] Creating trade...');
      const createRes = await fetch('/api/stablefx/create-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id }),
      });

      const createData = await createRes.json();

      if (!createRes.ok || createData.error) {
        throw new Error(createData.error || 'Failed to create trade');
      }

      const newTradeId = createData.trade.id;
      setTradeId(newTradeId);
      console.log('[swap] Trade created:', newTradeId);

      // Step 2: Sign trade intent
      setStep('signing');
      console.log('[swap] Signing trade...');

      const signRes = await fetch('/api/stablefx/sign-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeId: newTradeId,
          walletId: arcWalletId,
          walletAddress: walletAddress,
          quoteId: quote.id,
        }),
      });

      const signData = await signRes.json();

      if (!signRes.ok || signData.error) {
        throw new Error(signData.error || 'Failed to sign trade');
      }

      console.log('[swap] Trade signed successfully');

      // Step 3: Fetch the trade details to get contractTradeId
      setStep('fetching-contract-id');
      console.log('[swap] Fetching trade details for contractTradeId...');
      
      const tradeDetailsRes = await fetch(`/api/stablefx/get-trade?tradeId=${newTradeId}`, {
        method: 'GET',
      });

      if (!tradeDetailsRes.ok) {
        throw new Error('Failed to fetch trade details');
      }

      const tradeDetailsData = await tradeDetailsRes.json();
      const contractTradeId = tradeDetailsData.trade?.contractTradeId;
      
      if (!contractTradeId) {
        throw new Error('Trade not ready for funding - missing contractTradeId. Status: ' + (tradeDetailsData.trade?.status || 'unknown'));
      }

      console.log('[swap] Got contractTradeId:', contractTradeId);

      // Step 4: Fund the trade (always uses Arc wallet via arcWalletId)
      setStep('funding');
      console.log('[swap] Funding trade with Arc wallet...');

      const fundRes = await fetch('/api/stablefx/fund-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeId: newTradeId,
          contractTradeId: contractTradeId,
          walletId: arcWalletId,
        }),
      });

      const fundData = await fundRes.json();

      if (!fundRes.ok || fundData.error) {
        throw new Error(fundData.error || 'Failed to fund trade');
      }

      console.log('[swap] Trade funded successfully');

      setTxHashes({
        approval: fundData.approvalTxHash,
        funding: fundData.fundingTxHash,
      });

      setStep('complete');
      
      // Refresh balances after a delay
      setTimeout(() => {
        onRefreshBalances();
      }, 5000);

    } catch (err: any) {
      console.error('[swap] Error:', err);
      setError(err.message);
      setStep('error');
    }
  };

  const reset = () => {
    setStep('input');
    setAmount('');
    setQuote(null);
    setError('');
    setTradeId(null);
    setTxHashes({});
  };

  const flipCurrencies = () => {
    const newFrom = fromCurrency === 'USDC' ? 'EURC' : 'USDC';
    setFromCurrency(newFrom);
    setAmount('');
    setQuote(null);
    setError('');
    // No need to re-check Permit2 – we already checked both on mount
  };

  // Calculate time until quote expires
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!quote || step !== 'quote-ready') {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = new Date().getTime();
      const expiry = new Date(quote.expiry).getTime();
      const remaining = Math.max(0, Math.floor((expiry - now) / 1000));
      setTimeRemaining(remaining);

      if (remaining === 0) {
        setError('Quote expired. Please request a new quote.');
        setStep('error');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [quote, step]);

  // ── Loading state ───────────────────────────────────────────────────
  if (checkingPermit2) {
    return (
      <div className="py-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto mb-3"></div>
        <p className="text-sm text-slate-600">Checking Permit2 allowances...</p>
      </div>
    );
  }

  // ── Permit2 approval needed for current fromCurrency ────────────────
  if (!permit2Approved[fromCurrency]) {
    return (
      <div className="space-y-4">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Enable StableFX Swaps</h2>
          <p className="text-sm text-slate-600">
            Grant Permit2 permission to transfer {fromCurrency} from your Arc wallet. One-time setup per token.
          </p>
        </div>

        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <p className="text-xs text-amber-900">
            <strong>Permit2</strong> is a token approval contract by Uniswap. More gas-efficient and secure than traditional approvals.
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-600">Token</span>
            <span className="font-semibold text-slate-900">{fromCurrency}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Chain</span>
            <span className="text-slate-900">Arc Testnet</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Wallet</span>
            <span className="font-mono text-xs text-slate-600">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</span>
          </div>
        </div>

        <button
          onClick={() => grantPermit2Allowance(fromCurrency)}
          disabled={step === 'signing'}
          className="w-full px-4 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
        >
          {step === 'signing' ? 'Granting Permission...' : `Grant Permit2 for ${fromCurrency}`}
        </button>

        {/* Allow flipping even when not approved */}
        <button
          onClick={flipCurrencies}
          className="w-full px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
        >
          Switch to {toCurrency} → {fromCurrency} instead
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">{error}</div>
        )}
      </div>
    );
  }

  // ── Main swap interface ─────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">StableFX Spot Swap</h2>
          <p className="text-xs text-slate-500">Institutional RFQ-based forex conversion</p>
        </div>
        <a
          href={`https://testnet.arcscan.app/address/${walletAddress}?tab=token_transfers`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition"
          title="View Arc wallet token transfers"
        >
          <ExplorerIcon className="w-3.5 h-3.5" />
          Txns
        </a>
      </div>

      {/* Source info */}
      <div className="bg-blue-50 rounded-lg px-3 py-2 border border-blue-200">
        <p className="text-xs text-blue-900">
          Swaps use your <strong>Arc wallet</strong> balance. USDC: ${usdcBalance.toFixed(2)} · EURC: €{eurcBalance.toFixed(2)}
        </p>
      </div>

      {/* Input Interface */}
      {step === 'input' && (
        <div className="space-y-4">
          {/* From Currency */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">You Pay</label>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-xl font-bold bg-transparent border-none outline-none flex-1"
                />
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-slate-300">
                  <span className="text-lg">{fromCurrency === 'USDC' ? '$' : '€'}</span>
                  <span className="font-semibold text-slate-900 text-sm">{fromCurrency}</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Balance: {fromCurrency === 'USDC' ? '$' : '€'}{availableBalance.toFixed(2)}</span>
                <button
                  onClick={() => setAmount(availableBalance.toFixed(2))}
                  className="text-slate-700 hover:text-slate-900 font-medium"
                >
                  Max
                </button>
              </div>
            </div>
          </div>

          {/* Flip Button */}
          <div className="flex justify-center">
            <button
              onClick={flipCurrencies}
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition"
            >
              <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To Currency */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">You Receive (Estimated)</label>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold text-slate-400">—</span>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-slate-300">
                  <span className="text-lg">{toCurrency === 'USDC' ? '$' : '€'}</span>
                  <span className="font-semibold text-slate-900 text-sm">{toCurrency}</span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={requestQuote}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > availableBalance}
            className="w-full px-4 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
          >
            Get Quote
          </button>
        </div>
      )}

      {/* Quote Display */}
      {(step === 'quote-ready' || step === 'quoting') && (
        <div className="space-y-4">
          {step === 'quoting' ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900 mx-auto mb-3"></div>
              <p className="font-semibold text-slate-900 mb-1">Requesting Quote...</p>
              <p className="text-xs text-slate-600">1-3 seconds</p>
            </div>
          ) : quote && (
            <>
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-emerald-900 text-sm">Best Quote</h3>
                  {timeRemaining !== null && (
                    <span className="text-xs font-medium text-emerald-700">
                      Expires in {timeRemaining}s
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">You Pay</span>
                    <span className="text-lg font-bold text-slate-900">
                      {fromCurrency === 'USDC' ? '$' : '€'}{parseFloat(quote.from.amount).toFixed(2)} {quote.from.currency}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">You Receive</span>
                    <span className="text-lg font-bold text-emerald-700">
                      {toCurrency === 'USDC' ? '$' : '€'}{parseFloat(quote.to.amount).toFixed(2)} {quote.to.currency}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-emerald-200">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-slate-600">Rate</span>
                      <span className="font-semibold text-slate-900">
                        1 {quote.from.currency} = {parseFloat(quote.rate).toFixed(6)} {quote.to.currency}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600">Fee</span>
                      <span className="font-semibold text-slate-900">
                        {parseFloat(quote.fee.amount).toFixed(4)} {quote.fee.currency}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="flex-1 px-4 py-3 bg-slate-200 text-slate-900 font-semibold rounded-lg hover:bg-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={executeSwap}
                  className="flex-1 px-4 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition"
                >
                  Execute Swap
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Processing Steps */}
      {(step === 'creating-trade' || step === 'signing' || step === 'fetching-contract-id' || step === 'funding') && (
        <div className="text-center py-8 space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900 mx-auto"></div>
          <div>
            <p className="font-semibold text-slate-900 mb-1">
              {step === 'creating-trade' && 'Creating Trade...'}
              {step === 'signing' && 'Signing Trade Intent...'}
              {step === 'fetching-contract-id' && 'Preparing for Funding...'}
              {step === 'funding' && 'Funding Trade Onchain...'}
            </p>
            <p className="text-xs text-slate-600">
              {step === 'fetching-contract-id' 
                ? 'Waiting for pending_settlement status...'
                : '30-60 seconds. Please wait.'}
            </p>
          </div>

          {tradeId && (
            <p className="text-xs text-slate-500 font-mono">Trade: {tradeId.slice(0, 12)}...</p>
          )}
        </div>
      )}

      {/* Success */}
      {step === 'complete' && quote && (
        <div className="space-y-4">
          <div className="bg-emerald-50 rounded-lg p-5 border border-emerald-200 text-center">
            <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-emerald-900 mb-1">Swap Complete!</h3>
            <p className="text-sm text-slate-700 mb-3">
              {parseFloat(quote.from.amount).toFixed(2)} {quote.from.currency} → {parseFloat(quote.to.amount).toFixed(2)} {quote.to.currency}
            </p>
            
            <a
              href={`https://testnet.arcscan.app/address/${walletAddress}?tab=token_transfers`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
            >
              <ExplorerIcon className="w-4 h-4" />
              View Token Transfers on Explorer
            </a>
          </div>

          <button
            onClick={reset}
            className="w-full px-4 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Make Another Swap
          </button>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="space-y-3">
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <p className="font-semibold text-red-900 mb-1 text-sm">Error</p>
            <p className="text-xs text-red-800">{error}</p>
          </div>

          <button
            onClick={reset}
            className="w-full px-4 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}