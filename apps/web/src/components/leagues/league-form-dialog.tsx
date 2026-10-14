'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { LeagueCard } from '@sportbet/domain';
import { BUTTON_PRIMARY } from '../hub/styles';
import { Icon } from '../shell/icon';
import {
  DESCRIPTION_MAX_LENGTH,
  LEAGUE_CREATE,
  LEAGUE_DELETE,
  LEAGUE_UPDATE,
  NAME_MAX_LENGTH,
} from './league-paths';
import { Modal } from './modal';

const LABEL = 'mb-1 block text-[0.75rem] font-semibold text-muted';
const INPUT =
  'w-full rounded-md border border-border bg-card px-2 py-1 text-[0.85rem] text-text';
const QUIET =
  'cursor-pointer rounded-full border border-border bg-transparent px-4 py-1.5 text-[0.85rem] font-semibold text-muted hover:text-text';

/** What a form's boxes start with. */
interface Start {
  readonly name: string;
  readonly description: string;
  readonly baseFee: string;
  readonly penaltyStep: string;
}

const EMPTY: Start = {
  name: '',
  description: '',
  baseFee: '',
  penaltyStep: '',
};

const feeText = (fee: number | null): string =>
  fee === null ? '' : String(fee);

/**
 * The boxes of sportbet's create and edit modals: the name (required, 100),
 * the description (R-121: 500), and the two fees in whole euros from 0. The
 * names are the ones LeagueController reads.
 */
function LeagueFields({ start }: { start: Start }): JSX.Element {
  return (
    <div className="grid gap-3">
      <label className={LABEL}>
        <span>
          Pavadinimas <span className="text-bad">*</span>
        </span>
        <input
          type="text"
          name="name"
          defaultValue={start.name}
          required
          maxLength={NAME_MAX_LENGTH}
          className={INPUT}
        />
      </label>
      <label className={LABEL}>
        Aprašymas
        <input
          type="text"
          name="description"
          defaultValue={start.description}
          maxLength={DESCRIPTION_MAX_LENGTH}
          className={INPUT}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>
          Dalyvio mokestis (€)
          <input
            type="number"
            name="base_fee"
            defaultValue={start.baseFee}
            min={0}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          Papildomas mokestis už vietą (€)
          <input
            type="number"
            name="penalty_step"
            defaultValue={start.penaltyStep}
            min={0}
            className={INPUT}
          />
        </label>
      </div>
    </div>
  );
}

/** "Sukurti lygą" on the card's title row, and the modal it opens: a plain form to `/leagues/create`. */
export function CreateLeague(): JSX.Element {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className={BUTTON_PRIMARY}
      >
        <Icon name="plus-lg" />
        Sukurti lygą
      </button>
      <Modal
        open={open}
        close={close}
        title="Sukurti naują lygą"
        icon="plus-circle"
      >
        <form method="post" action={LEAGUE_CREATE}>
          <LeagueFields start={EMPTY} />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={close} className={QUIET}>
              Atšaukti
            </button>
            <button type="submit" className={BUTTON_PRIMARY}>
              <Icon name="plus-lg" />
              Sukurti
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** The confirmation sportbet asks before a league is deleted (`confirmDeleteLeague`). */
const deleteQuestion = (name: string): string =>
  `Ištrinti lygą "${name}"? Visi nariai bus pašalinti. Šis veiksmas negrįžtamas.`;

/**
 * sportbet's edit modal for a league the player administers: the boxes
 * filled with the league's own, saved to `/leagues/update`; and, for the
 * owner of a private league, "Ištrinti lygą" - a button of the edit form's
 * row that submits its own form to `/leagues/delete` after a confirmation.
 */
export function EditLeagueDialog({
  league,
  close,
}: {
  league: Pick<
    LeagueCard,
    'id' | 'name' | 'description' | 'baseFee' | 'penaltyStep' | 'may'
  >;
  close: () => void;
}): JSX.Element {
  const deleteForm = `delete-league-${String(league.id)}`;
  return (
    <Modal open close={close} title={league.name} icon="pencil">
      <form method="post" action={LEAGUE_UPDATE}>
        <input type="hidden" name="leagueID" value={String(league.id)} />
        <LeagueFields
          start={{
            name: league.name,
            description: league.description ?? '',
            baseFee: feeText(league.baseFee),
            penaltyStep: feeText(league.penaltyStep),
          }}
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          {league.may.delete ? (
            <button
              type="submit"
              form={deleteForm}
              onClick={(event) => {
                if (!window.confirm(deleteQuestion(league.name))) {
                  event.preventDefault();
                }
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-bad bg-transparent px-4 py-1.5 text-[0.85rem] font-semibold text-bad hover:bg-bad hover:text-on-state"
            >
              <Icon name="trash" />
              Ištrinti lygą
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={close} className={QUIET}>
              Atšaukti
            </button>
            <button type="submit" className={BUTTON_PRIMARY}>
              <Icon name="check-lg" />
              Išsaugoti
            </button>
          </div>
        </div>
      </form>
      {league.may.delete ? (
        <form id={deleteForm} method="post" action={LEAGUE_DELETE} hidden>
          <input type="hidden" name="leagueID" value={String(league.id)} />
        </form>
      ) : null}
    </Modal>
  );
}
