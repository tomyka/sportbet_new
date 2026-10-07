import { anyLeaderboardEntry } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { Shell } from '../components/shell/shell';
import { ThemeScript } from '../components/shell/theme-script';
import { env } from '../env';
import { getDb } from '../server/db';
import { requestContext } from '../server/request-context';
import { shellViewFor } from '../server/shell-for';
import { signInDialogState } from '../server/sign-in/dialog';
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
  // Per request, never at build: the shell's view is this visitor's, read
  // fresh from the request context (decision 5), and ADSENSE_CLIENT is read
  // where the page is served.
  await connection();
  const context = await requestContext();
  const signIn = context.player === null ? await signInDialogState() : null;
  // "Lyderiai" is a guest's entry, so only a guest's request asks.
  const leaderboardOffered =
    context.player === null && (await anyLeaderboardEntry(getDb(), ruledRules));
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="lt" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <Shell
          view={shellViewFor(context, leaderboardOffered)}
          signIn={signIn}
          adsenseClient={env().ADSENSE_CLIENT ?? null}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
