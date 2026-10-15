import type { JSX } from 'react';
import Link from 'next/link';
import type { AdminTournament } from '@sportbet/db';
import type { TournamentStatus } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { BUTTON_PRIMARY, CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import {
  ADMIN_TOURNAMENT_CREATE_PATH,
  tournamentContextPath,
  tournamentEditPath,
} from './admin-paths';
import {
  ACTION_BUTTON,
  PRIMARY_BUTTON,
  TABLE,
  TD,
  TH,
  TITLE_ROW,
} from './admin-styles';

/** The status as the form offers it (R-55): sportbet's `upcoming`, `active`, `finished`, in Lithuanian. */
export const STATUS_TEXT: Readonly<Record<TournamentStatus, string>> = {
  upcoming: 'Artėjantis',
  active: 'Vykstantis',
  finished: 'Baigtas',
};

const BADGE: Readonly<Record<TournamentStatus, string>> = {
  upcoming: 'bg-warn text-on-warn',
  active: 'bg-ok text-on-state',
  finished: 'bg-surface-2 text-muted',
};

/** One tournament: its name and slug, sport, status in words, start day, and its two actions. */
function TournamentRow({ tournament, profile }: AdminTournament): JSX.Element {
  return (
    <tr data-testid="tournament-row">
      <td className={TD}>{tournament.id}</td>
      <td className={TD}>
        <strong>{tournament.name}</strong>
        <br />
        <small className="text-muted">{tournament.slug}</small>
      </td>
      <td className={TD}>{profile.sport}</td>
      <td className={TD}>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${BADGE[profile.status]}`}
        >
          {STATUS_TEXT[profile.status]}
        </span>
      </td>
      <td className={TD}>{profile.startsOn ?? '-'}</td>
      <td className={`${TD} text-right whitespace-nowrap`}>
        <Link
          href={tournamentEditPath(tournament.id)}
          className={ACTION_BUTTON}
        >
          Redaguoti
        </Link>{' '}
        <form
          method="post"
          action={tournamentContextPath(tournament.id)}
          className="inline"
        >
          <button
            type="submit"
            title="Dirbti šiame turnyre"
            className={PRIMARY_BUTTON}
          >
            ▶ Kontekstas
          </button>
        </form>
      </td>
    </tr>
  );
}

/**
 * admin/tournaments/index.blade.php: "Turnyrai" with their count, "Naujas
 * turnyras", and each tournament newest first with "Redaguoti" and "▶
 * Kontekstas" ("Dirbti šiame turnyre": a POST choosing the tournament the
 * admin works on).
 */
export function TournamentsView({
  tournaments,
  flash,
}: {
  tournaments: readonly AdminTournament[];
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className={CARD}>
      <div className={TITLE_ROW}>
        <h1 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="globe2" /> Turnyrai
          <span
            data-testid="tournament-count"
            className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-normal text-muted"
          >
            {tournaments.length}
          </span>
        </h1>
        <Link href={ADMIN_TOURNAMENT_CREATE_PATH} className={BUTTON_PRIMARY}>
          <Icon name="plus-lg" /> Naujas turnyras
        </Link>
      </div>
      {flash === null ? null : <FlashAlert flash={flash} />}
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>#</th>
              <th className={TH}>Pavadinimas</th>
              <th className={TH}>Sportas</th>
              <th className={TH}>Statusas</th>
              <th className={TH}>Pradžia</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {tournaments.map((each) => (
              <TournamentRow key={each.tournament.id} {...each} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
