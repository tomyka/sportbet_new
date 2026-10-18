import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { Browser, documentOf } from '../support/browser';

// Inter is served by the app itself (next/font/local, files in the repo):
// the home page links a stylesheet whose @font-face rules name both subsets
// among the build's own static files, and no Google host is named anywhere.
// The standalone server under test serves no static files (the image copies
// them), so the build's .next/static is read from disk.

const baseUrl = inject('baseUrl');
const BUILD = join(import.meta.dirname, '..', '..', '.next');

describe('the font', () => {
  it('is Inter, latin and latin-ext, from files of the build', async () => {
    const page = await new Browser(baseUrl, '192.0.2.80').get('/');
    expect(page.html).not.toMatch(/googleapis|gstatic/);
    const hrefs = [
      ...documentOf(page).querySelectorAll('link[rel="stylesheet"]'),
    ].flatMap((link) => link.getAttribute('href') ?? []);
    expect(hrefs).not.toEqual([]);
    const files: string[] = [];
    let css = '';
    for (const href of hrefs) {
      const path = join(BUILD, href.replace(/^\/_next\//, ''));
      const text = readFileSync(path, 'utf8');
      css += text;
      for (const match of text.matchAll(/url\(["']?([^)"']+\.woff2)/g)) {
        files.push(join(path, '..', match[1] ?? ''));
      }
    }
    expect(css).not.toMatch(/googleapis|gstatic/);
    expect(files.some((file) => file.includes('inter_latin_wght'))).toBe(true);
    expect(files.some((file) => file.includes('inter_latin_ext_wght'))).toBe(
      true,
    );
    for (const file of files) expect(existsSync(file)).toBe(true);
    expect(css).toMatch(/font-weight:\s*400 800/);
  });
});
