import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata = {
  title: 'arctan(x) - Institutional Stablecoin Infrastructure',
  description: 'Chain-agnostic institutional-grade stablecoin forex perpetual futures DEX with cross-chain margin rehypothecation',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#0f172a', // slate-900
          colorText: '#0f172a',
          colorTextSecondary: '#64748b',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        },
      }}
    >
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
