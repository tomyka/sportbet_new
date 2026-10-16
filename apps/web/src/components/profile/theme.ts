/** The two themes the choice offers; light is the base of tokens.css. */
export type Theme = 'light' | 'dark';

/** The storage key theme-script.tsx reads before first paint. */
const THEME_KEY = 'sb-theme';

/** The theme the page shows now: dark only when `data-theme` says so (theme-script.tsx). */
export function currentTheme(root: Element): Theme {
  return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Chooses the theme in this browser (sportbet's sbSetTheme, issue 134): the
 * choice is stored under `sb-theme` for the next load's script, and drawn at
 * once by `data-theme` on the root. No server state. A browser that refuses
 * storage still shows the choice for this page.
 */
export function applyTheme(
  theme: Theme,
  root: Element,
  storage: Pick<Storage, 'setItem'>,
): void {
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  try {
    storage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or a full store: the page already shows it.
  }
}
