// Bundles the reader into one ESM file, as packages/db bundles its bins: the
// workspace packages export .ts sources, which Node cannot load on its own.
// The container tooling and the MySQL driver stay external (they are this
// package's own dependencies, loaded from its node_modules); db's migrations
// are copied beside dist/, where its bundled MIGRATIONS_FOLDER points.
import { cpSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/bin/migrate.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  external: ['testcontainers', '@testcontainers/*', 'mysql2', 'pg-native'],
  // pg is CommonJS and calls require(); an ESM bundle has to provide one.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

rmSync('migrations', { recursive: true, force: true });
cpSync('../../packages/db/migrations', 'migrations', { recursive: true });
