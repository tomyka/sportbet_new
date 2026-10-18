import type { JSX } from 'react';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { Shell } from '../components/shell/shell';
import { ThemeScript } from '../components/shell/theme-script';
import { env } from '../env';
import { cachedLeaderboardOffered } from '../server/leaderboard';
import { requestContext } from '../server/request-context';
import { shellViewFor } from '../server/shell-for';
import { signInDialogState } from '../server/sign-in/dialog';
import './globals.css';

// Inter as sportbet loads it (400-800): variable font files kept in the repo
// (fonts/, SIL OFL) and served by the app itself, so neither the build nor a
// page makes a request to Google. The latin file has no Lithuanian letters
// (ąčęėįšųūžĄČĘĖĮŠŲŪŽ), so the latin-ext file follows it in --font-sans
// (globals.css) and the browser takes each glyph from the first file that
// has it. No fallback metrics, so none shadows the latin face.
const inter = localFont({
  src: './fonts/inter-latin-wght-normal.woff2',
  weight: '400 800',
  variable: '--font-inter',
  display: 'swap',
  adjustFontFallback: false,
  fallback: [],
});
const interLatinExt = localFont({
  src: './fonts/inter-latin-ext-wght-normal.woff2',
  weight: '400 800',
  variable: '--font-inter-ext',
  display: 'swap',
  adjustFontFallback: false,
  fallback: [],
  preload: false,
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
}): Promise<JSX.Element> {
  // Per request, never at build: the shell's view is this visitor's, read
  // fresh from the request context (decision 5), and ADSENSE_CLIENT is read
  // where the page is served.
  await connection();
  const context = await requestContext();
  const signIn = context.player === null ? await signInDialogState() : null;
  // "Lyderiai" is a guest's entry, so only a guest's request asks.
  const leaderboardOffered =
    context.player === null && (await cachedLeaderboardOffered());
  return (
    // The theme script sets data-theme before React hydrates.
    <html
      lang="lt"
      className={`${inter.variable} ${interLatinExt.variable}`}
      suppressHydrationWarning
    >
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
