'use client';
import Image from "next/image";

import { SignIn } from '@clerk/nextjs';

export function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="flex justify-center mb-6">
          <Image
            src="/logo-image.png"
            alt="Arctan logo"
            width={180}
            height={56}
            className="object-contain"
            priority
          />
        </div>
        <SignIn
          routing="hash"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-lg border border-slate-200 rounded-xl",
              headerTitle: "text-slate-900 font-semibold",
              headerSubtitle: "text-slate-600",
              socialButtonsBlockButton:
                "border-slate-300 hover:bg-slate-50 text-slate-700 font-medium",
              formButtonPrimary:
                "bg-slate-900 hover:bg-slate-800 text-white font-semibold",
              formFieldInput:
                "border-slate-300 focus:border-slate-900 focus:ring-slate-900",
              footerActionLink:
                "text-slate-900 hover:text-slate-700 font-medium",
            },
          }}
        />
      </div>
    </div>
  );
}