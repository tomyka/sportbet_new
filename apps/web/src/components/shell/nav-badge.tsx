'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { NavSurface } from './nav-entries';
import type { BadgeKind } from './shell-view';

/**
 * The surface the badge sits on, and so which side its tip opens on
 * (sportbet's data-bs-placement: right, left, top). The guest bar's pills
 * carry none.
 */
type BadgeSurface = Exclude<NavSurface, 'pills'>;

/** sportbet's sentences (lang/lt.json), one per badge. */
export function badgeLabel(kind: BadgeKind, count: number): string {
  switch (kind) {
    case 'results':
      return 'Pateikti ne visi dienos rungtynių spėjimai.';
    case 'standings':
      return 'Pateikti ne visi eigos spėjimai.';
    case 'survival':
      return 'Vis dar nepasirinkote komandos Išlikimo žaidime.';
    case 'invites':
      return `Nepatvirtinti kvietimai į lygas: ${String(count)}`;
  }
}

// .sb-nav-badge
const BADGE =
  'inline-grid flex-none place-items-center rounded-full bg-bad leading-none font-extrabold tracking-normal text-on-state normal-case';

// Bootstrap 5.0's tooltip, which sportbet never re-skinned: near-black at
// 90%, white text, 200px wide at most.
const TIP =
  'pointer-events-none fixed z-[1080] max-w-[200px] rounded-sm bg-ink px-2 py-1 text-center text-[0.875rem] leading-normal font-normal tracking-normal text-on-ink normal-case opacity-90';
const GAP = 6;

interface TipAt {
  readonly left: number;
  readonly top: number;
}

/**
 * Per placement: the badge's own classes (.sb-rail-link .sb-nav-badge,
 * .sb-tab .sb-nav-badge), and where its tip opens - the point it is
 * anchored at, beside the badge's box, and the shift that puts the tip on
 * that side of the point.
 */
const BADGE_BY_PLACEMENT: Record<
  BadgeSurface,
  {
    readonly badge: string;
    readonly tipShift: string;
    readonly tipAt: (box: DOMRect) => TipAt;
  }
> = {
  rail: {
    badge:
      'ml-auto size-[17px] text-[0.68rem] shadow-[0_0_0_3px_var(--color-bad-tint)]',
    tipShift: '-translate-y-1/2',
    tipAt: (box) => ({ left: box.right + GAP, top: box.top + box.height / 2 }),
  },
  menu: {
    badge:
      'size-[17px] text-[0.68rem] shadow-[0_0_0_3px_var(--color-bad-tint)]',
    tipShift: '-translate-x-full -translate-y-1/2',
    tipAt: (box) => ({ left: box.left - GAP, top: box.top + box.height / 2 }),
  },
  tabs: {
    badge:
      'absolute top-0 left-1/2 size-[14px] translate-x-[6px] -translate-y-[3px] text-[0.58rem] shadow-[0_0_0_2px_var(--color-rail)]',
    tipShift: '-translate-x-1/2 -translate-y-full',
    tipAt: (box) => ({ left: box.left + box.width / 2, top: box.top - GAP }),
  },
};

/**
 * The outstanding-prediction mark (sportbet issue 163): always rendered,
 * `hidden` when there is nothing to do (issue 166), addressed by
 * `data-missing`. Its sentence is its accessible name and, on hover, a tip
 * drawn into <body> - both navigations clip their overflow, which is why
 * sportbet's tooltip had data-bs-container="body".
 */
export function NavBadge({
  kind,
  count,
  placement,
}: {
  kind: BadgeKind;
  count: number;
  placement: BadgeSurface;
}) {
  const [tip, setTip] = useState<TipAt | null>(null);
  const label = badgeLabel(kind, count);
  const at = BADGE_BY_PLACEMENT[placement];
  return (
    <>
      <span
        className={`${BADGE} ${at.badge}`}
        data-missing={kind}
        hidden={count === 0}
        role="img"
        aria-label={label}
        onMouseEnter={(event) => {
          setTip(at.tipAt(event.currentTarget.getBoundingClientRect()));
        }}
        onMouseLeave={() => {
          setTip(null);
        }}
      >
        !
      </span>
      {tip === null
        ? null
        : createPortal(
            <span
              role="tooltip"
              className={`${TIP} ${at.tipShift}`}
              style={{ left: tip.left, top: tip.top }}
            >
              {label}
            </span>,
            document.body,
          )}
    </>
  );
}
