'use client';

import type { JSX } from 'react';
import type { PredictionsMenuRound } from '@sportbet/db';
import { useRouter } from 'next/navigation';
import { predictionsPathFor } from '../shell/shell-paths';

/**
 * The page's round menu (results.blade.php's select): "Visi etapai", then
 * each round. Choosing one opens the list at it; "Visi etapai" opens every
 * round (R-58 - sportbet's sent no round, so it fell back to the current).
 */
export function RoundMenu({
  rounds,
  selected,
}: {
  rounds: readonly PredictionsMenuRound[];
  selected: number | 'all';
}): JSX.Element {
  const router = useRouter();
  return (
    <select
      aria-label="Etapas"
      value={String(selected)}
      onChange={(event) => {
        const value = event.target.value;
        router.push(
          predictionsPathFor(value === 'all' ? 'all' : Number(value)),
        );
      }}
      className="w-auto rounded-[8px] border border-border bg-card px-2 py-1 text-[0.78rem] text-text"
    >
      <option value="all">Visi etapai</option>
      {rounds.map(({ id, name }) => (
        <option key={id} value={String(id)}>
          {name}
        </option>
      ))}
    </select>
  );
}
