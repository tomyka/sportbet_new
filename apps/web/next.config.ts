import path from 'node:path';
import type { NextConfig } from 'next';

// `next build` runs in apps/web; the workspace root is two levels up.
const workspaceRoot = path.resolve(process.cwd(), '../..');

// Set at build time by the Vercel staging deploy (decision 12). On Oracle,
// Caddy sends the header instead, so the variable stays unset there and
// production never gets it.
const isStaging = process.env['SPORTBET_ENV'] === 'staging';

// On every page in every environment: no other site may frame one
// (clickjacking), and no browser may guess a response's type.
const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  transpilePackages: ['@sportbet/domain', '@sportbet/db'],
  poweredByHeader: false,
  // `next dev` would otherwise write AGENTS.md and CLAUDE.md into apps/web;
  // this repo's agent rules live in its own CLAUDE.md and docs/.
  agentRules: false,
  reactStrictMode: true,
  headers: () =>
    Promise.resolve([
      {
        source: '/:path*',
        headers: [
          ...SECURITY_HEADERS,
          ...(isStaging
            ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]
            : []),
        ],
      },
    ]),
};

export default config;
