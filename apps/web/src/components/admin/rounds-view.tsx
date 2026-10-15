import type { JSX } from 'react';
import type { AdminRoundRow } from '@sportbet/db';
import type { Tournament } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { EVENT_SAVE_PATH } from './admin-paths';
import {
  DANGER_BUTTON,
  FIELD_INPUT,
  ROUND_GRID,
  TINY_INPUT,
  TITLE_ROW,
} from './admin-styles';
import { AutoSubmitForm } from './auto-submit-form';
import { ConfirmButton } from './confirm-button';
import { NewRoundRow } from './new-round-row';
import { StageOptions } from './stage-options';
import { TournamentContextNote } from './tournament-context-note';

const HEADER_CELL = 'text-[0.75rem] font-semibold text-muted';

/** A switch's box, named as sportbet's form names it. */
function Switch({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}): JSX.Element {
  return (
    <input
      type="checkbox"
      name={name}
      aria-label={label}
      defaultChecked={checked}
      className="mx-auto size-4"
    />
  );
}

/** The question sportbet asks before a round is deleted. */
const deleteQuestion = (name: string): string => `Ištrinti turą „${name}“?`;

/** The round's number, switches, stage and rate boxes. */
function RoundSettings({ round }: { round: AdminRoundRow }): JSX.Element {
  return (
    <>
      <input
        type="number"
        name="eventDay"
        aria-label="Turo diena"
        defaultValue={round.number}
        min={1}
        className={TINY_INPUT}
      />
      <Switch
        name="eventSurvival"
        label="Išlikimo turas"
        checked={round.survival}
      />
      <Switch
        name="isKnockout"
        label="Play-off turas (baudinių serija)"
        checked={round.knockout}
      />
      <select
        name="stage"
        aria-label="Turo etapas"
        defaultValue={round.stage}
        className={FIELD_INPUT}
      >
        <StageOptions />
      </select>
      <input
        type="number"
        name="rate"
        aria-label="Koeficientas"
        defaultValue={round.rate.value}
        min={1}
        max={127}
        step={1}
        className={TINY_INPUT}
      />
    </>
  );
}

/**
 * One round's row, which saves itself (EventController::updateEvent): its
 * name and settings; "Ištrinti turą" only for a round with no game (a
 * round with games is kept, and so is one a survival pick names - the
 * server decides that).
 */
function RoundRow({ round }: { round: AdminRoundRow }): JSX.Element {
  return (
    <AutoSubmitForm
      action={EVENT_SAVE_PATH}
      className={ROUND_GRID}
      testId="round-row"
      datasetId={String(round.id)}
    >
      <input type="hidden" name="eventID" value={String(round.id)} />
      <span className="text-[0.75rem] text-muted">{round.id}</span>
      <input
        type="text"
        name="event"
        aria-label="Turo pavadinimas"
        defaultValue={round.name}
        className={FIELD_INPUT}
      />
      <RoundSettings round={round} />
      {round.games === 0 ? (
        <ConfirmButton
          question={deleteQuestion(round.name)}
          name="delete"
          value="1"
          title="Ištrinti turą"
          className={`${DANGER_BUTTON} justify-center px-2`}
        >
          <Icon name="trash" />
        </ConfirmButton>
      ) : (
        <span />
      )}
    </AutoSubmitForm>
  );
}

/**
 * admin/events.blade.php: "Turai" with their count, the tournament they
 * are the rounds of, the one-time message, a row for each round of it and
 * the insert row last ("Pridėti turą"; its rate prefilled from the stage,
 * R-10). sportbet's "Aktyvus" switch has no counterpart here: a round has
 * no such flag.
 */
export function RoundsView({
  tournament,
  rounds,
  flash,
}: {
  tournament: Tournament | null;
  rounds: readonly AdminRoundRow[];
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className={CARD}>
      <div className={TITLE_ROW}>
        <h1 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="calendar3" /> Turai
          <span
            data-testid="round-count"
            className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-normal text-muted"
          >
            {rounds.length}
          </span>
        </h1>
      </div>
      <TournamentContextNote tournament={tournament} />
      {flash === null ? null : <FlashAlert flash={flash} />}
      {tournament === null ? null : (
        <div className="overflow-x-auto">
          <div className={ROUND_GRID} role="presentation">
            <span className={HEADER_CELL}>#</span>
            <span className={HEADER_CELL}>Turas</span>
            <span className={`${HEADER_CELL} text-center`}>Diena</span>
            <span
              className={`${HEADER_CELL} text-center`}
              title="Išlikimo turas"
            >
              Išlik.
            </span>
            <span
              className={`${HEADER_CELL} text-center`}
              title="Play-off turas (baudinių serija)"
            >
              P/O
            </span>
            <span className={HEADER_CELL}>Etapas</span>
            <span className={`${HEADER_CELL} text-center`} title="Koeficientas">
              Rate
            </span>
            <span />
          </div>
          {rounds.map((round) => (
            <RoundRow key={round.id} round={round} />
          ))}
          <NewRoundRow />
        </div>
      )}
    </div>
  );
}
