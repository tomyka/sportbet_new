import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_SCRIPT, ThemeScript } from './theme-script';

// The script runs in <head> before the first paint, so it is tested by
// running it, as the browser does.
function runScript(): void {
  window.eval(THEME_SCRIPT);
}

const theme = () => document.documentElement.getAttribute('data-theme');

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('ThemeScript', () => {
  it('is inline, with nothing to fetch', () => {
    expect(renderToStaticMarkup(<ThemeScript />)).toBe(
      `<script>${THEME_SCRIPT}</script>`,
    );
  });

  it('leaves a first-time visitor on light', () => {
    runScript();
    expect(theme()).toBeNull();
  });

  it('turns the page dark for a visitor who chose dark', () => {
    localStorage.setItem('sb-theme', 'dark');
    runScript();
    expect(theme()).toBe('dark');
  });

  it('keeps light for any other stored value', () => {
    localStorage.setItem('sb-theme', 'light');
    runScript();
    expect(theme()).toBeNull();
  });

  it('keeps light, without an error, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(runScript).not.toThrow();
    expect(theme()).toBeNull();
  });
});
