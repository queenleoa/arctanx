import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'arctan(x) - Institutional Stablecoin Forex DEX',
  description: 'Chain agnostic institutional grade stablecoin forex perps DEX',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}