'use client';

import type { JSX, ReactNode, RefObject } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { POP_BOX } from './styles';

/** How near a screen edge the tooltip's centre may get (half of its widest line). */
const EDGE = 100;

interface At {
  readonly x: number;
  readonly y: number;
}

/**
 * Where a tooltip is while it shows: the point above the trigger's centre,
 * measured when it opens, kept inside the screen, and forgotten at the next
 * scroll (the point would no longer be the trigger's).
 */
function useTooltipAt(): {
  trigger: RefObject<HTMLSpanElement | null>;
  at: At | null;
  show: () => void;
  hide: () => void;
} {
  const [at, setAt] = useState<At | null>(null);
  const trigger = useRef<HTMLSpanElement>(null);
  const shown = at !== null;

  useEffect(() => {
    if (!shown) return undefined;
    const hide = () => {
      setAt(null);
    };
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('scroll', hide, true);
    };
  }, [shown]);

  const show = () => {
    const box = trigger.current?.getBoundingClientRect();
    if (box === undefined) return;
    const centre = box.left + box.width / 2;
    setAt({
      x: Math.min(Math.max(centre, EDGE), window.innerWidth - EDGE),
      y: box.top,
    });
  };
  return {
    trigger,
    at,
    show,
    hide: () => {
      setAt(null);
    },
  };
}

/**
 * Bootstrap's hover-and-focus popover: the content in a tooltip centred
 * above the trigger. The tooltip is fixed where the trigger was measured,
 * so a table that scrolls does not clip it, and a scroll hides it.
 */
export function HoverPop({
  content,
  children,
  testId,
  data,
  className = '',
}: {
  content: ReactNode;
  children: ReactNode;
  testId?: string;
  /** data-* attributes of the trigger. */
  data?: Readonly<Record<`data-${string}`, string>>;
  className?: string;
}): JSX.Element {
  const { trigger, at, show, hide } = useTooltipAt();
  const id = useId();
  return (
    <span
      ref={trigger}
      tabIndex={0}
      data-testid={testId}
      {...data}
      aria-describedby={at === null ? undefined : id}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={`cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      {children}
      {at === null ? null : (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'fixed',
            left: `${String(at.x)}px`,
            top: `${String(at.y)}px`,
          }}
          className={`pointer-events-none z-50 -mt-2 block -translate-x-1/2 -translate-y-full ${POP_BOX}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
