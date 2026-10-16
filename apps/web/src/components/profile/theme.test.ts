import { describe, expect, it } from 'vitest';
import { applyTheme, currentTheme } from './theme';

const root = () => document.createElement('html');

describe('currentTheme', () => {
  it('is dark only when data-theme says dark', () => {
    const element = root();
    expect(currentTheme(element)).toBe('light');
    element.setAttribute('data-theme', 'dark');
    expect(currentTheme(element)).toBe('dark');
    element.setAttribute('data-theme', 'sepia');
    expect(currentTheme(element)).toBe('light');
  });
});

describe('applyTheme', () => {
  it('sets data-theme and stores the choice for the next load', () => {
    const element = root();
    const stored: [string, string][] = [];
    const storage = {
      setItem: (key: string, value: string) => {
        stored.push([key, value]);
      },
    };
    applyTheme('dark', element, storage);
    expect(element.getAttribute('data-theme')).toBe('dark');
    applyTheme('light', element, storage);
    expect(element.hasAttribute('data-theme')).toBe(false);
    expect(stored).toEqual([
      ['sb-theme', 'dark'],
      ['sb-theme', 'light'],
    ]);
  });

  it('still shows the choice when the browser refuses storage', () => {
    const element = root();
    applyTheme('dark', element, {
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(element.getAttribute('data-theme')).toBe('dark');
  });
});
