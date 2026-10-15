'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { utcPreview, vilniusTipOff, type Instant } from '@sportbet/domain';
import { vilniusClock, vilniusDate } from '../format/vilnius-time';
import { Modal } from '../leagues/modal';
import { Icon } from '../shell/icon';
import { problemLine } from './admin-alert';
import type { GamesPageData, ListedGame } from './listed-game';
import {
  DELETE_GAME_PATH,
  INSERT_GAME_PATH,
  UPDATE_GAME_PATH,
} from './admin-paths';
import {
  DANGER_BUTTON,
  FIELD_INPUT,
  FIELD_LABEL,
  PRIMARY_BUTTON,
} from './admin-styles';

const QUIET =
  'cursor-pointer rounded-md border border-border bg-transparent px-3 py-1 text-[0.8rem] font-semibold text-muted hover:text-text';

/** The time box's value for an instant: `YYYY-MM-DDTHH:mm`, Vilnius time, as the box posts it (R-91). */
function vilniusLocal(at: Instant): string {
  return `${vilniusDate(at)}T${vilniusClock(at)}`;
}

/** The game the dialog opens on: a new one, with sportbet's defaults, or an existing one. */
export type GameDialogTarget =
  | { readonly kind: 'new' }
  | { readonly kind: 'edit'; readonly game: ListedGame };

/** What a new game's time box starts with: the latest game's time, as sportbet's default. */
const newGameTime = (page: GamesPageData): string =>
  page.latestTipOff === null ? '' : vilniusLocal(page.latestTipOff);

/**
 * What R-91 shows under the time box before saving: the UTC time the typed
 * Vilnius time will be saved as, or why it cannot be (the spring hour does
 * not exist, the autumn hour is ambiguous). Nothing while the box is empty
 * or half typed.
 */
function TimePreview({ typed }: { typed: string }): JSX.Element {
  const tipOff = vilniusTipOff(typed);
  if (tipOff.ok) {
    return (
      <p data-testid="utc-preview" className="mt-1 text-[0.75rem] text-muted">
        Bus išsaugota: {utcPreview(tipOff.value)}
      </p>
    );
  }
  if (tipOff.refusal === 'bad-time') {
    return <p data-testid="utc-preview" className="mt-1 min-h-4" />;
  }
  return (
    <p
      data-testid="utc-preview"
      role="alert"
      className="mt-1 text-[0.75rem] text-bad"
    >
      {problemLine({ field: 'gameDateTime', problem: tipOff.refusal })}
    </p>
  );
}

/** The time box, in Vilnius time, with the UTC it will save as under it. */
function TimeField({ initial }: { initial: string }): JSX.Element {
  const [typed, setTyped] = useState(initial);
  return (
    <div>
      <label className={FIELD_LABEL} htmlFor="game-time">
        Data ir laikas
      </label>
      <input
        id="game-time"
        type="datetime-local"
        name="gameDateTime"
        step={60}
        required
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
        className={FIELD_INPUT}
      />
      <TimePreview typed={typed} />
    </div>
  );
}

/** One of the two team boxes, offering the tournament's teams (issue 272) and a dash. */
function TeamSelect({
  label,
  name,
  chosen,
  teams,
}: {
  label: string;
  name: 'homeTeamID' | 'awayTeamID';
  chosen: string;
  teams: GamesPageData['teams'];
}): JSX.Element {
  return (
    <label className={FIELD_LABEL}>
      {label}
      <select name={name} defaultValue={chosen} className={FIELD_INPUT}>
        <option value="">-</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The round box ("Etapas"), the tournament's rounds. */
function RoundSelect({
  chosen,
  rounds,
}: {
  chosen: string;
  rounds: GamesPageData['rounds'];
}): JSX.Element {
  return (
    <label className={FIELD_LABEL}>
      Etapas
      <select name="eventID" defaultValue={chosen} className={FIELD_INPUT}>
        <option value="">-</option>
        {rounds.map((round) => (
          <option key={round.id} value={String(round.id)}>
            {round.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The boxes: time, home, away and round, filled from the game or sportbet's defaults for a new one. */
function GameFields({
  game,
  page,
}: {
  game: ListedGame | null;
  page: GamesPageData;
}): JSX.Element {
  return (
    <div className="grid gap-3">
      <TimeField
        initial={game === null ? newGameTime(page) : vilniusLocal(game.tipOff)}
      />
      <TeamSelect
        label="Šeimininkai"
        name="homeTeamID"
        chosen={game === null ? '' : String(game.home)}
        teams={page.teams}
      />
      <TeamSelect
        label="Svečiai"
        name="awayTeamID"
        chosen={game === null ? '' : String(game.away)}
        teams={page.teams}
      />
      <RoundSelect
        chosen={String(game?.roundId ?? page.lastRoundId ?? '')}
        rounds={page.rounds}
      />
    </div>
  );
}

const DELETE_FORM = 'delete-game';

/**
 * sportbet's shared insert and edit modal (agmEditModal): "Naujas žaidimas"
 * or "Redaguoti žaidimą #N", its boxes, and "Ištrinti žaidimą" only for a
 * game the domain lets be deleted (R-89), which asks for the emailed code.
 */
export function GameDialog({
  target,
  page,
  close,
}: {
  target: GameDialogTarget;
  page: GamesPageData;
  close: () => void;
}): JSX.Element {
  const game = target.kind === 'edit' ? target.game : null;
  const deletable = game !== null && game.deletion === null;
  return (
    <Modal
      open
      close={close}
      title={
        game === null
          ? 'Naujas žaidimas'
          : `Redaguoti žaidimą #${String(game.id)}`
      }
      icon={game === null ? 'plus-circle' : 'pencil'}
      narrow
    >
      <form
        method="post"
        action={game === null ? INSERT_GAME_PATH : UPDATE_GAME_PATH}
      >
        {game === null ? null : (
          <input type="hidden" name="gameID" value={String(game.id)} />
        )}
        <GameFields game={game} page={page} />
        <div className="mt-3 flex items-center justify-between gap-2">
          {deletable ? (
            <button type="submit" form={DELETE_FORM} className={DANGER_BUTTON}>
              <Icon name="trash" />
              Ištrinti žaidimą
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={close} className={QUIET}>
              Atšaukti
            </button>
            <button type="submit" className={PRIMARY_BUTTON}>
              Išsaugoti
            </button>
          </div>
        </div>
      </form>
      {deletable ? (
        <form id={DELETE_FORM} method="post" action={DELETE_GAME_PATH} hidden>
          <input type="hidden" name="gameID" value={String(game.id)} />
        </form>
      ) : null}
    </Modal>
  );
}
