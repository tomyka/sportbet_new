// The look sign-off (spec 4a, "Testing"): the same guest page on
// sportbet.lt and on staging, at a phone's width and a desktop's, in both
// themes, side by side for the owner. The screenshots go to look-signoff/
// (git-ignored) and are never committed.
//
//   pnpm --filter @sportbet/web look:signoff
//   STAGING_URL=http://localhost:3000/ pnpm --filter @sportbet/web look:signoff

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const STAGING =
  process.env['STAGING_URL'] ?? 'https://sportbet-new-staging.vercel.app/';
const SITES = [
  { name: 'sportbet', url: 'https://sportbet.lt/' },
  { name: 'staging', url: STAGING },
];
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];
const THEMES = ['light', 'dark'];
const OUT = new URL('../look-signoff/', import.meta.url);

/** STAGING_URL comes from the shell, so it is written into index.html as text. */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const sections: string[] = [];
try {
  for (const size of SIZES) {
    for (const theme of THEMES) {
      const figures: string[] = [];
      for (const site of SITES) {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
        });
        // As a visitor's stored choice is: there before the page's own
        // theme script reads it.
        await context.addInitScript((dark: boolean) => {
          if (dark) localStorage.setItem('sb-theme', 'dark');
        }, theme === 'dark');
        const page = await context.newPage();
        await page.goto(site.url);
        // Both sites raise the cookie banner once their scripts have run.
        await page.getByRole('button', { name: 'Sutinku' }).waitFor();
        const file = `${size.name}-${theme}-${site.name}.png`;
        await page.screenshot({ path: fileURLToPath(new URL(file, OUT)) });
        await context.close();
        figures.push(
          `<figure><figcaption>${escapeHtml(site.name)} (${escapeHtml(site.url)})</figcaption><img src="${file}" alt="${escapeHtml(site.name)}"></figure>`,
        );
      }
      sections.push(
        `<h2>${size.name}, ${String(size.width)}px, ${theme}</h2><div class="pair">${figures.join('')}</div>`,
      );
    }
  }
} finally {
  await browser.close();
}

writeFileSync(
  new URL('index.html', OUT),
  `<!doctype html><meta charset="utf-8"><title>Look sign-off</title><style>body{font-family:sans-serif;margin:16px}.pair{display:flex;gap:16px;align-items:flex-start}figure{margin:0}img{border:1px solid;max-width:100%}</style><h1>sportbet.lt and staging, side by side</h1>${sections.join('')}`,
);
console.log(`Open ${fileURLToPath(new URL('index.html', OUT))}`);
