import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The build makes no network request for the font (a flaky download once
// failed CI): Inter is kept in the repo and loaded with next/font/local.

const SRC = import.meta.dirname;
const WEB = join(SRC, '..');
const FONTS = join(SRC, 'app', 'fonts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

describe('fonts', () => {
  const layout = readFileSync(join(SRC, 'app', 'layout.tsx'), 'utf8');

  it('loads Inter from the repo, not from Google', () => {
    expect(layout).toContain("from 'next/font/local'");
    expect(layout).not.toContain('next/font/google');
  });

  it('keeps latin and latin-ext files, which Lithuanian needs', () => {
    for (const name of [
      'inter-latin-wght-normal.woff2',
      'inter-latin-ext-wght-normal.woff2',
    ]) {
      expect(layout).toContain(`./fonts/${name}`);
      expect(existsSync(join(FONTS, name))).toBe(true);
    }
  });

  it('chains latin-ext after latin in the font stack', () => {
    const css = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
    expect(css).toMatch(/var\(--font-inter\),\s*var\(--font-inter-ext\)/);
  });

  it('names no Google font host in source or config', () => {
    const files = [...sourceFiles(SRC), join(WEB, 'next.config.ts')].filter(
      (file) => !file.endsWith('font-guard.test.ts'),
    );
    const offenders = files
      .filter((file) =>
        /fonts\.googleapis|fonts\.gstatic|next\/font\/google/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(WEB, file));
    expect(offenders).toEqual([]);
  });
});
