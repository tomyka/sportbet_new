import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { Shell } from '../components/shell/shell';
import { guestView } from '../components/shell/shell-view';
import { ThemeScript } from '../components/shell/theme-script';
import { env } from '../env';
import './globals.css';

// Inter as sportbet loads it (400-800), downloaded at build and served by
// the app itself: no request to Google at run time. latin-ext carries
// Lithuanian's letters.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SportBet',
  icons: {
    icon: { url: '/img/favicon.png', type: 'image/png' },
    apple: '/img/favicon-180.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Per request, never at build: ADSENSE_CLIENT is read where the page is
  // served, and the shell's view is this visitor's (the guest's until 4b).
  await connection();
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="lt" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <Shell view={guestView()} adsenseClient={env().ADSENSE_CLIENT ?? null}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
