'use client';

import type { JSX, ReactNode, RefObject } from 'react';
import { useEffect, useId, useRef } from 'react';
import { Icon, type IconName } from '../shell/icon';

/** What Tab may land on inside the dialog. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * While the modal is open: Escape shuts it, focus moves into the dialog and
 * Tab stays inside it, the page behind does not scroll, and on shutting,
 * focus goes back to what had it.
 */
function useDialogBehaviour(
  open: boolean,
  close: () => void,
  dialog: RefObject<HTMLDivElement | null>,
): void {
  // The latest close, so a parent that renders again does not restart the dialog's focus.
  const latestClose = useRef(close);
  useEffect(() => {
    latestClose.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement;
    const scrollWas = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        latestClose.current();
        return;
      }
      if (event.key === 'Tab') keepFocusIn(event, dialog.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = scrollWas;
      if (before instanceof HTMLElement) before.focus();
    };
  }, [open, dialog]);
}

/**
 * Where Tab must go instead of where the browser would send it, or null to
 * let it: round the dialog's focusable elements at either end, and from
 * outside the dialog (or an empty one) back in.
 */
function tabTarget(
  event: KeyboardEvent,
  dialog: HTMLElement,
): HTMLElement | null {
  const inside = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = inside[0];
  const last = inside[inside.length - 1];
  if (first === undefined || last === undefined) return dialog;
  const active = document.activeElement;
  if (!dialog.contains(active) || active === dialog) {
    return event.shiftKey ? last : first;
  }
  if (event.shiftKey && active === first) return last;
  return !event.shiftKey && active === last ? first : null;
}

/** Keeps Tab inside the dialog. */
function keepFocusIn(event: KeyboardEvent, dialog: HTMLElement | null): void {
  const target = dialog === null ? null : tabTarget(event, dialog);
  if (target === null) return;
  event.preventDefault();
  target.focus();
}

/**
 * Bootstrap's `.modal` as the league page uses it (`.lg-modal-*`): a title
 * bar with a close button over a body, centred over a scrim; shut by the
 * close button, a click on the scrim, or Escape. Nothing is drawn while it
 * is shut, so a closed dialog's fields are not on the page. It is a labelled
 * modal dialog: focus enters it and stays in it, the page does not scroll
 * behind it, and focus returns to the opener when it shuts.
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
  icon?: IconName;
  narrow?: boolean;
  children: ReactNode;
}): JSX.Element | null {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehaviour(open, close, dialog);
  if (!open) return null;
  return (
    <div>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[1050] bg-scrim"
        onClick={close}
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`fixed top-1/2 left-1/2 z-[1055] max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[12px] bg-card text-text shadow-[0_8px_32px_var(--color-shadow-strong)] outline-none ${narrow ? 'max-w-[400px]' : 'max-w-[500px]'}`}
      >
        <div className="flex items-center justify-between bg-ink px-4 py-3 text-on-ink">
          <h2
            id={titleId}
            className="m-0 flex items-center gap-2 text-[1rem] font-bold"
          >
            {icon === undefined ? null : <Icon name={icon} />}
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
