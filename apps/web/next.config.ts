import path from 'node:path';
import type { NextConfig } from 'next';

// `next build` runs in apps/web; the workspace root is two levels up.
const workspaceRoot = path.resolve(process.cwd(), '../..');

// Set at build time by the Vercel staging deploy (decision 12). On Oracle,
// Caddy sends the header instead, so the variable stays unset there and
// production never gets it.
const isStaging = process.env['SPORTBET_ENV'] === 'staging';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  transpilePackages: ['@sportbet/domain', '@sportbet/db'],
  poweredByHeader: false,
  reactStrictMode: true,
  headers: () =>
    Promise.resolve(
      isStaging
        ? [
            {
              source: '/:path*',
              headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
            },
          ]
        : [],
    ),
};

export default config;
