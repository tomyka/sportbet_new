'use client';

import type { JSX, ReactNode } from 'react';
import { useEffect } from 'react';
import { Icon, type IconName } from '../shell/icon';

/** Shuts the modal on Escape while it is open. */
function useEscape(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
}

/**
 * Bootstrap's `.modal` as the league page uses it (`.lg-modal-*`): a title
 * bar with a close button over a body, centred over a scrim; shut by the
 * close button, a click on the scrim, or Escape. Nothing is drawn while it
 * is shut, so a closed dialog's fields are not on the page.
 */
export function Modal({
  open,
  close,
  title,
  icon,
  narrow = false,
  children,
}: {
  open: boolean;
  close: () => void;
  title: string;
  icon: IconName;
  narrow?: boolean;
  children: ReactNode;
}): JSX.Element | null {
  useEscape(open, close);
  if (!open) return null;
  return (
    <div>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[1050] bg-scrim"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed top-1/2 left-1/2 z-[1055] max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[12px] bg-card text-text shadow-[0_8px_32px_var(--color-shadow-strong)] ${narrow ? 'max-w-[400px]' : 'max-w-[500px]'}`}
      >
        <div className="flex items-center justify-between bg-ink px-4 py-3 text-on-ink">
          <h2 className="m-0 flex items-center gap-2 text-[1rem] font-bold">
            <Icon name={icon} />
            {title}
          </h2>
          <button
            type="button"
            aria-label="Uždaryti"
            onClick={close}
            className="cursor-pointer border-none bg-transparent p-1 text-[1rem] text-on-ink"
          >
            <Icon name="x-lg" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
