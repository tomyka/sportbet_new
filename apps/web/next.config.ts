import path from 'node:path';
import type { NextConfig } from 'next';

// `next build` runs in apps/web; the workspace root is two levels up.
const workspaceRoot = path.resolve(process.cwd(), '../..');

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  transpilePackages: ['@sportbet/domain', '@sportbet/db'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
