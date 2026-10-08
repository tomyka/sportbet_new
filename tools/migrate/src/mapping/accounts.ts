import { playerOf } from '@sportbet/db';
import {
  foldEmail,
  sportbetColumns,
  type PlayerId,
  type StoredPlayer,
  type StoredPlayerSettings,
} from '@sportbet/domain';
import { ReaderProblem } from '../problem';
import type { SportbetRow } from '../read-columns';
import {
  dependsOn,
  firstBlocked,
  inherit,
  LOADED,
  PerTournament,
  refused,
  type Fate,
  type Ledger,
  type MapContext,
} from './ledger';

// The accounts: users (spec 4b's columns), their user_settings (one global
// switch and the settings 4b reads), and the leagues that say who plays a
// tournament.

export interface MappedUsers {
  readonly fates: Map<number, Fate>;
  readonly users: Map<number, StoredPlayer>;
}

/**
 * users: the id, the username and the account (spec 4b). Two users whose
 * addresses are equal once accents are dropped cannot both load:
 * players_email_folded_unique refuses the second, as sportbet's collation
 * would have. Neither is chosen over the other and neither address is
 * changed (spec 4b): both are refused.
 */
export function mapUsers(ctx: MapContext): MappedUsers {
  const { ledger } = ctx;
  const fates = new Map<number, Fate>();
  const users = new Map<number, StoredPlayer>();
  for (const row of ctx.rows.users) {
    const mapped = sportbetColumns.player(row);
    if (mapped.ok) {
      users.set(row.id, mapped.value);
      fates.set(row.id, LOADED);
    } else {
      fates.set(row.id, refused(mapped.refusal));
      ledger.refuse('users', mapped.refusal);
    }
  }
  const byFolded = new Map<string, number[]>();
  for (const [id, player] of users) {
    const key = foldEmail(player.email);
    byFolded.set(key, [...(byFolded.get(key) ?? []), id]);
  }
  for (const ids of byFolded.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      users.delete(id);
      fates.set(id, refused('email-collision'));
      ledger.refuse('users', 'email-collision');
    }
  }
  return { fates, users };
}

export interface MappedSettings {
  /** Each user's one global switch (user_settings.active). */
  readonly active: Map<number, boolean>;
  readonly settings: Map<number, StoredPlayerSettings>;
  /** Each user's rows, as read: counted once the players are known. */
  readonly rowsOf: Map<number, SportbetRow<'user_settings'>[]>;
  readonly fateOf: Map<number, 'kept' | 'duplicate' | 'refused'>;
}

/** What two rows of one user must agree on to count as one. */
const settingsKey = (row: SportbetRow<'user_settings'>): string =>
  `${String(row.active !== 0)}|${String(row.admin)}|${row.locale}`;

/** Refuses a user's settings rows, and the user with them if they loaded. */
function refuseSettings(
  refusal: {
    readonly ledger: Ledger;
    readonly users: MappedUsers;
    readonly settings: MappedSettings;
  },
  user: number,
  values: readonly unknown[],
  reason: string,
): void {
  const { ledger, users, settings } = refusal;
  values.forEach(() => {
    ledger.refuse('user_settings', reason);
  });
  if (users.fates.get(user)?.kind === 'loaded') {
    users.fates.set(user, refused(reason));
    users.users.delete(user);
    ledger.refuse('users', dependsOn(reason));
  }
  settings.fateOf.set(user, 'refused');
}

/** Each user's settings rows, as read. */
function settingsRowsByUser(
  ctx: MapContext,
): Map<number, SportbetRow<'user_settings'>[]> {
  const rowsOf = new Map<number, SportbetRow<'user_settings'>[]>();
  for (const row of ctx.rows.user_settings) {
    rowsOf.set(row.user_id, [...(rowsOf.get(row.user_id) ?? []), row]);
  }
  return rowsOf;
}

/**
 * user_settings: one global switch per user, and the settings 4b reads. A
 * user's rows that differ are refused, and the user with them; a user with
 * no row is refused too, as whether they are switched off cannot be read
 * (not guessed active).
 */
export function mapSettings(
  ctx: MapContext,
  users: MappedUsers,
): MappedSettings {
  const { ledger } = ctx;
  const settings: MappedSettings = {
    active: new Map(),
    settings: new Map(),
    rowsOf: settingsRowsByUser(ctx),
    fateOf: new Map(),
  };
  const refusal = { ledger, users, settings };
  for (const [user, values] of settings.rowsOf) {
    if (users.fates.get(user) === undefined) {
      values.forEach(() => {
        ledger.refuse('user_settings', 'orphan');
      });
      continue;
    }
    const [first] = values;
    if (first === undefined) continue;
    if (new Set(values.map(settingsKey)).size > 1) {
      refuseSettings(refusal, user, values, 'duplicate-key');
      continue;
    }
    const mapped = sportbetColumns.settings({
      player: playerOf(user),
      admin: first.admin,
      locale: first.locale,
    });
    if (!mapped.ok) {
      refuseSettings(refusal, user, values, mapped.refusal);
      continue;
    }
    settings.active.set(user, first.active !== 0);
    settings.settings.set(user, mapped.value);
    settings.fateOf.set(user, values.length > 1 ? 'duplicate' : 'kept');
  }
  for (const [user, fate] of users.fates) {
    if (fate.kind === 'loaded' && !settings.active.has(user)) {
      users.fates.set(user, refused('player-without-settings'));
      users.users.delete(user);
      ledger.refuse('users', 'player-without-settings');
    }
  }
  return settings;
}

export interface MappedLeagues {
  /** Each loaded league's tournament. */
  readonly tournamentOf: Map<number, number>;
  /** Each tournament's league members (sportbet user ids). */
  readonly members: PerTournament<number>;
  /** Each loaded league's members, as players. */
  readonly membersOf: Map<number, PlayerId[]>;
}

/** leagues: a league of a loaded tournament, and each one's fate. */
function mapLeagueRows(
  ctx: MapContext,
  tournamentFates: ReadonlyMap<number, Fate>,
): { tournamentOf: Map<number, number>; fates: Map<number, Fate> } {
  const { ledger } = ctx;
  const tournamentOf = new Map<number, number>();
  const fates = new Map<number, Fate>();
  for (const row of ctx.rows.leagues) {
    const parent = tournamentFates.get(row.tournament_id);
    if (ledger.follow('leagues', parent, `id ${String(row.id)}`)) {
      tournamentOf.set(row.id, row.tournament_id);
      fates.set(row.id, LOADED);
      ledger.load('leagues');
    } else {
      fates.set(
        row.id,
        parent === undefined ? refused('orphan') : inherit(parent),
      );
    }
  }
  return { tournamentOf, fates };
}

/** leagues and league_members: who plays a tournament. */
export function mapLeagues(
  ctx: MapContext,
  parents: {
    readonly tournamentFates: ReadonlyMap<number, Fate>;
    readonly users: MappedUsers;
  },
): MappedLeagues {
  const { ledger } = ctx;
  const leagues = mapLeagueRows(ctx, parents.tournamentFates);
  const members = new PerTournament<number>();
  const membersOf = new Map<number, PlayerId[]>();
  for (const row of ctx.rows.league_members) {
    const blocked = firstBlocked([
      leagues.fates.get(row.league_id),
      parents.users.fates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('league_members', blocked.fate, '');
      continue;
    }
    const tournament = leagues.tournamentOf.get(row.league_id);
    if (tournament === undefined) {
      throw new ReaderProblem('map: a league is missing');
    }
    members.add(tournament, row.user_id);
    membersOf.set(row.league_id, [
      ...(membersOf.get(row.league_id) ?? []),
      playerOf(row.user_id),
    ]);
    ledger.load('league_members');
  }
  return { tournamentOf: leagues.tournamentOf, members, membersOf };
}
