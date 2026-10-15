import type { JSX } from 'react';
import type { Tournament } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { CARD } from '../hub/styles';
import { TEAM_INSERT_SAVE_PATH } from './admin-paths';
import { FIELD_INPUT, PRIMARY_BUTTON } from './admin-styles';
import { TournamentContextNote } from './tournament-context-note';

/**
 * admin/teaminsert.blade.php's form: "Įveskite komandų kiekį:" and a
 * button, for a tournament with no team (the domain's 2 to 64). The teams
 * inserted are `team1` ... `teamN`, to be renamed on /admin/teams.
 */
export function TeamInsertForm(): JSX.Element {
  return (
    <form
      method="post"
      action={TEAM_INSERT_SAVE_PATH}
      data-testid="team-insert-form"
      className="flex flex-wrap items-center gap-2"
    >
      <label className="flex items-center gap-2 text-[0.85rem]">
        Įveskite komandų kiekį:
        <input
          type="number"
          name="teamCount"
          min={2}
          max={64}
          required
          className={`${FIELD_INPUT} w-20`}
        />
      </label>
      <button type="submit" className={PRIMARY_BUTTON}>
        Sukurti komandas
      </button>
    </form>
  );
}

/** /admin/teaminsert: the form under the tournament it will write into, and the one-time message. */
export function TeamInsertView({
  tournament,
  flash,
}: {
  tournament: Tournament | null;
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className={CARD}>
      <TournamentContextNote tournament={tournament} />
      {flash === null ? null : <FlashAlert flash={flash} />}
      {tournament === null ? null : <TeamInsertForm />}
    </div>
  );
}
