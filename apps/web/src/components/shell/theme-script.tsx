import type { JSX } from 'react';
/**
 * Runs inline in <head>, before the first paint (layout.tsx): dark only
 * when the visitor chose it - localStorage 'sb-theme' is 'dark', as
 * sportbet stores it - and light otherwise, also when storage is blocked
 * and throws. Choosing the theme is a profile setting (slice 17), not part
 * of the shell.
 */
export const THEME_SCRIPT =
  "(function(){try{if(localStorage.getItem('sb-theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()";

export function ThemeScript(): JSX.Element {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
