'use client';

import type { JSX } from 'react';
import { useRef, useState } from 'react';
import { TeamCrest } from '../hub/team-crest';
import { CARD } from '../hub/styles';
import { Icon } from '../shell/icon';
import { stakeText, type PickCardView, type PickerView } from './picker-view';
import { postSurvivalPick } from './survival-answer';
import { SurvivalHero } from './survival-hero';
import { SV_HEAD, SV_HEAD_NOTE, SV_HEAD_TITLE } from './styles';

/** .sv-mark and .sv-ha: a check when used, a lock when disabled, otherwise the ground. */
function Mark({ mark }: { mark: PickCardView['mark'] }) {
  switch (mark) {
    case 'used':
      return (
        <span className="flex-none text-[0.95rem] text-dim">
          <Icon name="check-lg" />
        </span>
      );
    case 'locked':
      return (
        <span className="flex-none text-[0.95rem] text-dim">
          <Icon name="lock-fill" />
        </span>
      );
    case 'home':
      return (
        <span className="flex-none rounded-sm border border-accent bg-accent-tint px-1.5 py-0.5 text-[0.62rem] font-bold tracking-[0.05em] text-accent">
          Namie
        </span>
      );
    case 'away':
      return (
        <span className="flex-none rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[0.62rem] font-bold tracking-[0.05em] text-muted">
          Išvykoje
        </span>
      );
  }
}

/** One team's radio and card (.sv-slot): the radio is named by the team, its line describes it. */
function TeamCard({
  card,
  checked,
  onPick,
}: {
  card: PickCardView;
  checked: boolean;
  onPick: (team: string) => void;
}) {
  const nameId = `survival-team-${card.team}`;
  const lineId = `survival-line-${card.team}`;
  return (
    <label className="flex min-w-0 flex-auto cursor-pointer items-center gap-2.5 rounded-md border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:border-border-strong has-checked:border-accent has-checked:bg-accent-tint has-checked:shadow-[inset_0_0_0_1px_var(--color-accent)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent has-disabled:cursor-not-allowed has-disabled:opacity-45 has-disabled:hover:border-border has-disabled:has-checked:border-accent has-disabled:has-checked:opacity-80">
      <input
        type="radio"
        name="teamID"
        value={card.team}
        checked={checked}
        disabled={card.disabled}
        aria-labelledby={nameId}
        aria-describedby={lineId}
        onChange={() => {
          // A browser sends no change to a disabled radio; never post one.
          if (!card.disabled) onPick(card.team);
        }}
        className="sr-only"
      />
      <TeamCrest team={card.name} size="pick" />
      <span className="min-w-0 flex-1">
        <b id={nameId} className="block truncate text-[0.85rem] font-semibold">
          {card.name}
        </b>
        <span id={lineId} className="block truncate text-[0.72rem] text-dim">
          {card.line}
        </span>
      </span>
      <Mark mark={card.mark} />
    </label>
  );
}

/** The radio group of the round's teams (.sv-grid). */
function Grid({
  cards,
  checked,
  onPick,
}: {
  cards: readonly PickCardView[];
  checked: string | null;
  onPick: (team: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Rinkis komandą"
      className="grid grid-cols-1 gap-[9px] min-[421px]:grid-cols-[repeat(auto-fill,minmax(230px,1fr))]"
    >
      {cards.map((card) => (
        <div key={card.team} className="relative flex min-w-0">
          <TeamCard
            card={card}
            checked={checked === card.team}
            onPick={onPick}
          />
        </div>
      ))}
    </div>
  );
}

/** The pick card: its heading and counts, R-4's notice, a refusal's alert, the grid and the hint. */
function PickCard({
  view,
  checked,
  error,
  onPick,
}: {
  view: PickerView;
  checked: string | null;
  error: string | null;
  onPick: (team: string) => void;
}) {
  return (
    <section className={`${CARD} mb-4`}>
      <div className={SV_HEAD}>
        <h2 className={SV_HEAD_TITLE}>{view.heading}</h2>
        <span className={SV_HEAD_NOTE}>
          {`Laisvų: ${String(view.free)} · Panaudotų: ${String(view.used)}`}
        </span>
      </div>
      {view.lockNotice ? (
        <p
          role="status"
          className="mb-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-[0.85rem] text-muted"
        >
          Pasirinkimas užfiksuotas - pasirinktos komandos rungtynės jau
          prasidėjo.
        </p>
      ) : null}
      {error === null ? null : (
        <div
          role="alert"
          className="mb-3 rounded-md border border-bad bg-bad-tint px-3 py-2 text-[0.85rem] text-text"
        >
          {error}
        </div>
      )}
      <Grid cards={view.cards} checked={checked} onPick={onPick} />
      <p className="mt-3 mb-0 text-[0.76rem] text-dim">
        Komandą gali rinktis ar keisti iki jos rungtynių pradžios.
      </p>
    </section>
  );
}

/**
 * survival.blade.php's hero and pick card: a click saves at once
 * (updateUserSurvivalSelection). Accepted, the radio stays and the stake
 * follows it; refused, the alert says why and the radio goes back to the
 * pick the server holds.
 */
export function SurvivalPicker({ view }: { view: PickerView }): JSX.Element {
  const [held, setHeld] = useState(view.held);
  const [checked, setChecked] = useState(view.held);
  const [error, setError] = useState<string | null>(null);
  // What a refusal puts the grid back to, current even between renders.
  const heldNow = useRef(view.held);

  const pick = async (team: string) => {
    setChecked(team);
    const outcome = await postSurvivalPick({ team, round: view.round });
    if (outcome.kind === 'saved') {
      heldNow.current = team;
      setHeld(team);
      setError(null);
      return;
    }
    setError(outcome.message);
    setChecked(heldNow.current);
  };

  return (
    <>
      <SurvivalHero
        streak={view.streak}
        runPoints={view.runPoints}
        verdict={view.verdict}
        stake={stakeText(view, held)}
      />
      <PickCard
        view={view}
        checked={checked}
        error={error}
        onPick={(team) => {
          void pick(team);
        }}
      />
    </>
  );
}
