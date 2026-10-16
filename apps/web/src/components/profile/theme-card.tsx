'use client';

import { useEffect, useState, type JSX } from 'react';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';
import { applyTheme, currentTheme, type Theme } from './theme';

const CHOICES: readonly { readonly theme: Theme; readonly label: string }[] = [
  { theme: 'light', label: 'Šviesi' },
  { theme: 'dark', label: 'Tamsi' },
];

const BUTTON =
  'cursor-pointer px-4 py-1 text-[0.8rem] font-semibold border border-border';

const ACTIVE = 'bg-accent text-on-accent border-accent';

const IDLE = 'bg-transparent text-muted';

/**
 * "Tema": "Šviesi" or "Tamsi", per browser (issue 134): the choice is
 * written to `localStorage['sb-theme']` and drawn at once by `data-theme`;
 * the page's own script reads it before the first paint of every later load.
 */
export function ThemeCard(): JSX.Element {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    setTheme(currentTheme(document.documentElement));
  }, []);
  return (
    <div className={`${CARD} mb-3`}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="gear-fill" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>Tema</h2>
      </div>
      <div role="group" aria-label="Tema" className="inline-flex">
        {CHOICES.map(({ theme: choice, label }) => (
          <button
            key={choice}
            type="button"
            aria-pressed={theme === choice}
            className={`${BUTTON} ${theme === choice ? ACTIVE : IDLE} ${choice === 'light' ? 'rounded-l-md' : 'rounded-r-md'}`}
            onClick={() => {
              applyTheme(choice, document.documentElement, localStorage);
              setTheme(choice);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
