'use client';

import { SignIn } from '@clerk/nextjs';

export function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-14 h-14 bg-slate-900 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl font-bold">x</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">arctan(x)</h1>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Sign In
          </h2>
          <p className="text-slate-600">
            Access your institutional multi-chain wallet
          </p>
        </div>
        <SignIn 
          routing="hash"
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
  );
}