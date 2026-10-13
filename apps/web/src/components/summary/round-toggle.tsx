'use client';

import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { Icon } from '../shell/icon';
import { MY_COLUMN, STICKY_COLUMN } from './styles';

/** One player's round sum, as the header row shows it: the text is blank at 0. */
export interface RoundSum {
  readonly key: string;
  readonly text: string;
  readonly me: boolean;
}

/**
 * A round of the results table: its header row (chevron, name, "(n)" and
 * each player's sum) toggles the games under it. The games are drawn by the
 * server and shown only while the round is unfolded.
 */
export function RoundGroup({
  name,
  count,
  columns,
  defaultOpen,
  children,
}: {
  name: string;
  count: number;
  columns: readonly RoundSum[];
  defaultOpen: boolean;
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <tbody>
      <tr className="group bg-surface-2 hover:bg-accent-tint">
        <td
          title={name}
          className={`${STICKY_COLUMN} border-t-2 border-r-2 border-b-2 border-l-[3px] border-t-border border-r-border border-b-border border-l-accent bg-inherit p-0`}
        >
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              setOpen((was) => !was);
            }}
            className="flex w-full max-w-[108px] cursor-pointer items-center gap-2 overflow-hidden border-none bg-transparent px-2.5 py-[9px] text-left select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
          >
            <span className="flex-none text-text">
              <Icon name={open ? 'chevron-down' : 'chevron-right'} />
            </span>
            <span className="truncate text-[0.8rem] font-bold tracking-[0.05em] text-accent uppercase">
              {name}
            </span>
            <span className="text-[0.72rem] font-normal text-muted">
              {`(${String(count)})`}
            </span>
          </button>
        </td>
        {columns.map(({ key, text, me }) => (
          <td
            key={key}
            data-testid="sr-round-total"
            data-me={me ? 'true' : undefined}
            className={`border-t-2 border-r border-b-2 border-t-border border-r-border border-b-border px-2 py-[9px] text-center text-[0.82rem] font-extrabold text-accent ${me ? MY_COLUMN : 'bg-inherit'}`}
          >
            {text}
          </td>
        ))}
      </tr>
      {open ? children : null}
    </tbody>
  );
}
