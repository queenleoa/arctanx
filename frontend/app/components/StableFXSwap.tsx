'use client';

import { useState, useEffect } from 'react';

interface StableFXSwapProps {
  walletAddress: string; // Arc testnet wallet address
  arcWalletId: string; // Circle wallet ID for Arc
  usdcBalance: number;
  eurcBalance: number;
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
  const [permit2Approved, setPermit2Approved] = useState(false);
  const [checkingPermit2, setCheckingPermit2] = useState(true);

  const toCurrency = fromCurrency === 'USDC' ? 'EURC' : 'USDC';
  const availableBalance = fromCurrency === 'USDC' ? usdcBalance : eurcBalance;

  // Check Permit2 allowance on mount
  useEffect(() => {
    checkPermit2Allowance();
  }, []);

  const checkPermit2Allowance = async () => {
    setCheckingPermit2(true);
    try {
      const res = await fetch('/api/stablefx/check-permit2-allowance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          walletAddress,
          currency: fromCurrency 
        }),
      });
      const data = await res.json();
      setPermit2Approved(data.hasAllowance || false);
    } catch (err) {
      console.error('Error checking Permit2:', err);
    } finally {
      setCheckingPermit2(false);
    }
  };

  const grantPermit2Allowance = async () => {
    setStep('signing');
    setError('');
    
    try {
      const res = await fetch('/api/stablefx/grant-permit2-allowance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          walletId: arcWalletId,
          currency: fromCurrency 
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to grant Permit2 allowance');
      }

      setPermit2Approved(true);
      alert('✅ Permit2 allowance granted! You can now execute swaps.');
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
      setError(`Insufficient ${fromCurrency} balance`);
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
      // After signing, the trade should have reached pending_settlement and have a contractTradeId
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

      // Step 4: Fund the trade
      setStep('funding');
      console.log('[swap] Funding trade...');

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
    setFromCurrency(fromCurrency === 'USDC' ? 'EURC' : 'USDC');
    setAmount('');
    setQuote(null);
    setError('');
    checkPermit2Allowance();
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

  if (checkingPermit2) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto mb-3"></div>
          <p className="text-sm text-slate-600">Checking Permit2 allowance...</p>
        </div>
      </div>
    );
  }

  if (!permit2Approved) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Enable StableFX Swaps</h2>
          <p className="text-slate-600">
            Before you can execute swaps, you need to grant the Permit2 contract permission to transfer {fromCurrency} on your behalf. This is a one-time setup per token.
          </p>
        </div>

        <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-900 mb-1">What is Permit2?</p>
              <p className="text-sm text-amber-800">
                Permit2 is a token approval contract by Uniswap that allows you to grant permissions once and use them across multiple protocols. It's more gas-efficient and secure than traditional approvals.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-700">Token to Approve</span>
              <span className="font-semibold text-slate-900">{fromCurrency}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-700">Contract</span>
              <span className="font-mono text-xs text-slate-600">Permit2</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700">Chain</span>
              <span className="text-sm text-slate-900">Arc Testnet</span>
            </div>
          </div>

          <button
            onClick={grantPermit2Allowance}
            disabled={step === 'signing'}
            className="w-full px-6 py-4 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition text-lg"
          >
            {step === 'signing' ? 'Granting Permission...' : `Grant Permit2 Permission for ${fromCurrency}`}
          </button>

          <p className="text-xs text-slate-500 text-center">
            This transaction will be signed using your Circle wallet on Arc testnet. You only need to do this once per token.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">StableFX Spot Swap</h2>
        <p className="text-slate-600">
          Institutional RFQ-based forex conversion with best execution pricing
        </p>
      </div>

      {/* Input Interface */}
      {step === 'input' && (
        <div className="space-y-6">
          {/* From Currency */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">You Pay</label>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-2xl font-bold bg-transparent border-none outline-none flex-1"
                />
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-300">
                  <span className="text-xl">{fromCurrency === 'USDC' ? '$' : '€'}</span>
                  <span className="font-semibold text-slate-900">{fromCurrency}</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-sm">
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
              className="p-3 bg-slate-100 hover:bg-slate-200 rounded-full transition"
            >
              <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To Currency */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">You Receive (Estimated)</label>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-slate-400">—</span>
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-300">
                  <span className="text-xl">{toCurrency === 'USDC' ? '$' : '€'}</span>
                  <span className="font-semibold text-slate-900">{toCurrency}</span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={requestQuote}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > availableBalance}
            className="w-full px-6 py-4 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition text-lg"
          >
            Get Quote
          </button>

          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>RFQ Mode:</strong> Your quote request is sent to institutional market makers who compete to provide the best rate. Quotes are valid for 5 minutes.
            </p>
          </div>
        </div>
      )}

      {/* Quote Display */}
      {(step === 'quote-ready' || step === 'quoting') && (
        <div className="space-y-6">
          {step === 'quoting' ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
              <p className="font-semibold text-slate-900 mb-2">Requesting Quote from Market Makers...</p>
              <p className="text-sm text-slate-600">This usually takes 1-3 seconds</p>
            </div>
          ) : quote && (
            <>
              {/* Quote Details */}
              <div className="bg-emerald-50 rounded-lg p-6 border border-emerald-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-emerald-900">Best Quote Received</h3>
                  {timeRemaining !== null && (
                    <span className="text-sm font-medium text-emerald-700">
                      Expires in {timeRemaining}s
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">You Pay</span>
                    <span className="text-xl font-bold text-slate-900">
                      {fromCurrency === 'USDC' ? '$' : '€'}{parseFloat(quote.from.amount).toFixed(2)} {quote.from.currency}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">You Receive</span>
                    <span className="text-xl font-bold text-emerald-700">
                      {toCurrency === 'USDC' ? '$' : '€'}{parseFloat(quote.to.amount).toFixed(2)} {quote.to.currency}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-emerald-200">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-slate-600">Exchange Rate</span>
                      <span className="font-semibold text-slate-900">
                        1 {quote.from.currency} = {parseFloat(quote.rate).toFixed(6)} {quote.to.currency}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Fee</span>
                      <span className="font-semibold text-slate-900">
                        {parseFloat(quote.fee.amount).toFixed(2)} {quote.fee.currency}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 px-6 py-4 bg-slate-200 text-slate-900 font-semibold rounded-lg hover:bg-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={executeSwap}
                  className="flex-1 px-6 py-4 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition text-lg"
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
        <div className="text-center py-12 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
          <div>
            <p className="font-semibold text-slate-900 mb-2">
              {step === 'creating-trade' && 'Creating Trade on StableFX...'}
              {step === 'signing' && 'Signing Trade Intent...'}
              {step === 'fetching-contract-id' && 'Preparing Trade for Funding...'}
              {step === 'funding' && 'Funding Trade Onchain...'}
            </p>
            <p className="text-sm text-slate-600">
              {step === 'fetching-contract-id' 
                ? 'Waiting for trade to reach pending_settlement status...'
                : 'This may take 30-60 seconds. Please wait.'}
            </p>
          </div>

          {tradeId && (
            <p className="text-xs text-slate-500 font-mono">Trade ID: {tradeId}</p>
          )}
        </div>
      )}

      {/* Success */}
      {step === 'complete' && quote && (
        <div className="space-y-6">
          <div className="bg-emerald-50 rounded-lg p-6 border border-emerald-200 text-center">
            <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-emerald-900 mb-2">Swap Complete!</h3>
            <p className="text-slate-700 mb-4">
              Successfully swapped {parseFloat(quote.from.amount).toFixed(2)} {quote.from.currency} for {parseFloat(quote.to.amount).toFixed(2)} {quote.to.currency}
            </p>
            
            {txHashes.funding && (
              <a
                href={`https://arc-testnet.explorer.circle.com/tx/${txHashes.funding}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                View Transaction →
              </a>
            )}
          </div>

          <button
            onClick={reset}
            className="w-full px-6 py-4 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Make Another Swap
          </button>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="space-y-4">
          <div className="bg-red-50 rounded-lg p-6 border border-red-200">
            <p className="font-semibold text-red-900 mb-2">Error</p>
            <p className="text-sm text-red-800">{error}</p>
          </div>

          <button
            onClick={reset}
            className="w-full px-6 py-4 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}