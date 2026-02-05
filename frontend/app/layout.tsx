import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata = {
  title: 'arctan(x) - Institutional Stablecoin Forex DEX',
  description: 'Chain-agnostic institutional-grade stablecoin forex perps DEX with margin rehypothecation',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}