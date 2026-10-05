'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import { Icon } from './icon';

const PANEL_ID = 'sbNavMobile';

/**
 * The signed-in phone bar with its toggle, and the panel it opens below
 * (sportbet's .sb-toggler and #sbNavMobile collapse). Following a link in
 * the panel closes it, as the page load that followed did on sportbet.
 */
export function PhoneMenu({
  bar,
  brand,
  children,
}: {
  bar: string;
  brand: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeOnLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('a') !== null)
      setOpen(false);
  };
  return (
    <>
      <div className={bar}>
        {brand}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Atidaryti meniu"
            aria-controls={PANEL_ID}
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
            }}
            className="cursor-pointer border-none bg-transparent px-1.5 py-1 text-[1.6rem] leading-none text-rail-dim hover:text-on-rail focus:outline-none"
          >
            <Icon name="list" />
          </button>
        </div>
      </div>
      <div
        id={PANEL_ID}
        hidden={!open}
        onClick={closeOnLink}
        className="w-full border-t border-rail-wash-md bg-rail pb-2"
      >
        {children}
      </div>
    </>
  );
}
