'use client';

import type { JSX, SubmitEvent } from 'react';
import { useState } from 'react';
import type { AdminTeam, AdminTeamsPage } from '@sportbet/db';
import { Modal } from '../leagues/modal';
import { Icon } from '../shell/icon';
import { adminMessageText } from './admin-alert';
import { factsProblem } from './facts-check';
import { TEAMS_SAVE_PATH, UPDATE_TEAM_DETAILS_PATH } from './admin-paths';
import {
  ACTION_BUTTON,
  FIELD_INPUT,
  FIELD_LABEL,
  PRIMARY_BUTTON,
  TD,
  TH,
  TINY_INPUT,
} from './admin-styles';

/** What the viewer's role lets them do on the page (R-26 amended, R-92). */
export interface TeamsMay {
  /** The team's details: a superadmin. */
  readonly rename: boolean;
  /** Take the "final" mark off a table: a superadmin. */
  readonly unmark: boolean;
}

const QUIET =
  'cursor-pointer rounded-md border border-border bg-transparent px-3 py-1 text-[0.8rem] font-semibold text-muted hover:text-text';

/** sportbet's edit modal (atEditModal): the team's name; its group is not carried (a Euroleague table has none). */
function RenameDialog({
  team,
  close,
}: {
  team: AdminTeam;
  close: () => void;
}): JSX.Element {
  return (
    <Modal
      open
      close={close}
      title={`Redaguoti: ${team.name}`}
      icon="pencil"
      narrow
    >
      <form method="post" action={UPDATE_TEAM_DETAILS_PATH}>
        <input type="hidden" name="teamID" value={team.id} />
        <label className={FIELD_LABEL}>
          Pavadinimas
          <input
            type="text"
            name="teamName"
            defaultValue={team.name}
            required
            className={FIELD_INPUT}
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={close} className={QUIET}>
            Atšaukti
          </button>
          <button type="submit" className={PRIMARY_BUTTON}>
            Išsaugoti
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The "Galutinė lentelė" mark (R-92): a results manager may mark it, only a superadmin takes it off. */
function FinalMark({
  final,
  may,
}: {
  final: boolean;
  may: TeamsMay;
}): JSX.Element {
  const locked = final && !may.unmark;
  return (
    <div className="flex items-center gap-2 text-[0.85rem]">
      {locked ? <input type="hidden" name="final" value="1" /> : null}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name={locked ? undefined : 'final'}
          value="1"
          defaultChecked={final}
          disabled={locked}
        />
        Galutinė lentelė
      </label>
      {locked ? (
        <span className="text-[0.75rem] text-muted">
          (žymą gali nuimti tik superadministratorius)
        </span>
      ) : null}
    </div>
  );
}

const HEADS: readonly {
  readonly text: string;
  readonly title?: string;
  readonly center: boolean;
}[] = [
  { text: 'Komandos', center: false },
  { text: '#', center: true },
  { text: 'KF', title: 'Ketvirtfinalis', center: true },
  { text: 'PF', title: 'Pusfinalis', center: true },
  { text: 'F', title: 'Finalas', center: true },
];

/** The facts table's header: name, place, the two ticks and the final place. */
function FactsHead(): JSX.Element {
  return (
    <thead>
      <tr>
        {HEADS.map(({ text, title, center }) => (
          <th
            key={text}
            title={title}
            className={center ? `${TH} text-center` : TH}
          >
            {text}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** The four boxes of a team's row: place, the two ticks (each box's value is the row's index, as the domain reads them) and the final place. */
function OutcomeCells({
  team,
  row,
}: {
  team: AdminTeam;
  row: number;
}): JSX.Element {
  const { name, outcome } = team;
  return (
    <>
      <td className={`${TD} text-center`}>
        <input
          type="number"
          name="place"
          aria-label={`${name}: vieta`}
          defaultValue={outcome.place ?? ''}
          min={1}
          className={TINY_INPUT}
        />
      </td>
      <td className={`${TD} text-center`}>
        <input
          type="checkbox"
          name="playOffs"
          value={row}
          aria-label={`${name}: ketvirtfinalis`}
          defaultChecked={outcome.playOffs}
        />
      </td>
      <td className={`${TD} text-center`}>
        <input
          type="checkbox"
          name="finalFour"
          value={row}
          aria-label={`${name}: pusfinalis`}
          defaultChecked={outcome.finalFour}
        />
      </td>
      <td className={`${TD} text-center`}>
        <input
          type="number"
          name="finalPlace"
          aria-label={`${name}: finalo vieta`}
          defaultValue={outcome.finalPlace ?? ''}
          min={1}
          max={2}
          className={TINY_INPUT}
        />
      </td>
    </>
  );
}

/** One team's row: its hidden id, its name (a superadmin may open it for editing) and its boxes. */
function TeamRow({
  team,
  row,
  rename,
}: {
  team: AdminTeam;
  row: number;
  rename: (() => void) | null;
}): JSX.Element {
  return (
    <tr data-testid="team-row">
      <td className={TD}>
        <input type="hidden" name="teamID" value={team.id} />
        <span className="mr-2">{team.name}</span>
        {rename === null ? null : (
          <button
            type="button"
            aria-label={`Redaguoti komandą ${team.name}`}
            onClick={rename}
            className={ACTION_BUTTON}
          >
            <Icon name="pencil" />
          </button>
        )}
      </td>
      <OutcomeCells team={team} row={row} />
    </tr>
  );
}

/** Under the table: why it is held back, if it is, the final mark and the save button. */
function FactsFooter({
  problem,
  final,
  may,
}: {
  problem: string | null;
  final: boolean;
  may: TeamsMay;
}): JSX.Element {
  return (
    <>
      {problem === null ? null : (
        <p role="alert" className="mt-3 text-[0.83rem] text-bad">
          {problem}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <FinalMark final={final} may={may} />
        <button type="submit" className={PRIMARY_BUTTON}>
          Išsaugoti
        </button>
      </div>
    </>
  );
}

/**
 * Holds the facts form back, with the reason in the server's own words,
 * while it would be refused (factsProblem): the typed places stay.
 */
function useFactsGuard(teams: number): {
  readonly problem: string | null;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
} {
  const [problem, setProblem] = useState<string | null>(null);
  return {
    problem,
    onSubmit: (event) => {
      const posted = new FormData(event.currentTarget);
      const found = factsProblem(
        posted.getAll('place').map(String),
        posted.has('final'),
      );
      setProblem(
        found === null ? null : adminMessageText(found, { number: teams }),
      );
      if (found !== null) event.preventDefault();
    },
  };
}

/**
 * The facts form of admin/teams.blade.php, for the Euroleague (decision
 * 11): a row per team (KF: play-offs, PF: Final Four, F: the final place,
 * 1 or 2) posted together to updateTeams with "Galutinė lentelė" (R-92) and
 * one "Išsaugoti" (sportbet saves each time a box is left; the table now
 * recalculates every player's points at once, so it is saved when the
 * admin says so). A superadmin also opens each team's name for editing.
 */
export function TeamsTable({
  page,
  may,
}: {
  page: AdminTeamsPage;
  may: TeamsMay;
}): JSX.Element {
  const [renaming, setRenaming] = useState<AdminTeam | null>(null);
  const guard = useFactsGuard(page.teams.length);
  return (
    <>
      <form
        method="post"
        action={TEAMS_SAVE_PATH}
        data-testid="facts-form"
        onSubmit={guard.onSubmit}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.85rem]">
            <FactsHead />
            <tbody>
              {page.teams.map((team, row) => (
                <TeamRow
                  key={team.id}
                  team={team}
                  row={row}
                  rename={
                    may.rename
                      ? () => {
                          setRenaming(team);
                        }
                      : null
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
        <FactsFooter problem={guard.problem} final={page.final} may={may} />
      </form>
      {renaming === null ? null : (
        <RenameDialog
          team={renaming}
          close={() => {
            setRenaming(null);
          }}
        />
      )}
    </>
  );
}
