'use client';

import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

/**
 * A menu open or shut: shut by a click outside `root`, by focus moving from
 * inside `root` to an element outside it, or by Escape, which also puts the
 * focus back on `trigger` (the button that opened it) when the caller
 * attaches one.
 */
export function useMenu(): {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly root: RefObject<HTMLDivElement | null>;
  readonly trigger: RefObject<HTMLButtonElement | null>;
} {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        root.current?.contains(event.target) !== true
      )
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        root.current?.contains(event.relatedTarget) !== true
      )
        setOpen(false);
    };
    const element = root.current;
    element?.addEventListener('focusout', onFocusOut);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      element?.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return {
    open,
    toggle: () => {
      setOpen(!open);
    },
    root,
    trigger,
  };
}
