import type { JSX } from 'react';
import type { HeroVerdict } from './picker-view';
import { SV_LABEL } from './styles';

type PipState = 'hit' | 'now' | 'ahead';

const PIP_CLASSES: Readonly<Record<PipState, string>> = {
  hit: 'border-ok bg-ok text-on-state',
  now: 'border-accent bg-accent-tint text-accent',
  ahead: 'border-border bg-surface-2 text-dim',
};

/** max(5, streak + 1) pips: the hits filled, the next one marked (.sv-pips). */
function Pips({ streak }: { streak: number }) {
  const count = Math.max(5, streak + 1);
  return (
    <div className="flex flex-wrap gap-[5px]">
      {Array.from({ length: count }, (_, index) => {
        const n = index + 1;
        const state: PipState =
          n <= streak ? 'hit' : n === streak + 1 ? 'now' : 'ahead';
        return (
          <span
            key={n}
            data-testid="survival-pip"
            data-state={state}
            className={`grid size-[26px] place-items-center rounded-sm border text-[0.68rem] font-bold tabular-nums ${PIP_CLASSES[state]}`}
          >
            {n}
          </span>
        );
      })}
    </div>
  );
}

/** survival.blade.php's .sv-hero: the streak, the pips and the run's sum, the verdict, and the stake. */
export function SurvivalHero({
  streak,
  runPoints,
  verdict,
  stake,
}: {
  streak: number;
  runPoints: number;
  verdict: HeroVerdict;
  stake: string;
}): JSX.Element {
  return (
    <div className="mb-4 grid grid-cols-[1fr_auto] items-center gap-3.5 rounded-[12px] border border-border-strong bg-card p-3.5 shadow-[0_1px_4px_var(--color-shadow)] sm:grid-cols-[auto_1fr_auto] sm:gap-[22px] sm:px-5 sm:py-[18px]">
      <div className="col-start-1 row-start-1">
        <div
          data-testid="survival-streak"
          className="text-[2.4rem] leading-[0.9] font-extrabold text-accent tabular-nums sm:text-[3rem]"
        >
          {streak}
        </div>
        <div className={`${SV_LABEL} mt-1.5`}>Iš eilės</div>
      </div>
      <div className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <Pips streak={streak} />
        <div
          data-testid="survival-run-points"
          className={`${SV_LABEL} mt-[9px]`}
        >
          Surinkta serijoje{' '}
          <b className="text-text tabular-nums">{runPoints}</b> taškų
        </div>
        {verdict === null ? null : (
          <div
            className={`mt-2 text-[0.82rem] font-semibold ${verdict.state === 'survived' ? 'text-ok' : 'text-bad'}`}
          >
            {verdict.state === 'survived'
              ? `Turas užskaitytas: +${String(verdict.points)}`
              : 'Serija nutrūko - kitą turą pradedi iš naujo.'}
          </div>
        )}
      </div>
      <div className="col-start-2 row-start-1 self-end text-right sm:col-start-3 sm:self-center">
        <b
          data-testid="survival-stake"
          className="block text-[1.5rem] font-extrabold text-text tabular-nums"
        >
          {stake}
        </b>
        <span className={SV_LABEL}>Už šį turą</span>
      </div>
    </div>
  );
}
