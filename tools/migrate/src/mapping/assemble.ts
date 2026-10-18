import { playerOf } from '@sportbet/db/edge';
import type { RemindedRow } from '@sportbet/db/reminder';
import type { TournamentPlayer } from '@sportbet/db/league';
import {
  instantFrom,
  PlayerStatus,
  sportbetColumns,
  sportbetRules,
  StandingsPrediction,
  SurvivalRun,
  TeamOutcomes,
  tournamentId,
  type Instant,
  type PlayerId,
  type Role,
  type StoredPlayerSettings,
  type Tournament,
} from '@sportbet/domain';
import { ReaderProblem } from '../problem';
import type { MappedSettings, MappedUsers } from './accounts';
import { mapColours } from './colours';
import type { MappedLeagues } from './leagues';
import { dependsOn, must, type MapContext, type PerTournament } from './ledger';
import type { Parents, PredictionRow, SurvivalPickRow } from './player-rows';
import { refusedPointsOf, type LoadedRows } from './points';
import { selectLeagues, type LeagueSelections } from './selections';
import type { MappedTournaments } from './structure';
import type { Mapped, MappedTournament } from './types';

// Each loaded tournament assembled from its mapped rows, then the users and
// their settings counted now that the players are known.

/** Everything the assembly reads. */
export interface Assembly {
  readonly ctx: MapContext;
  readonly tournaments: MappedTournaments;
  readonly parents: Parents;
  readonly settings: MappedSettings;
  readonly leagues: MappedLeagues;
  readonly picks: PerTournament<SurvivalPickRow>;
  readonly loaded: LoadedRows;
}

/** Tournament `id`'s players: its leagues' members and everyone owning one of its loaded rows. */
function playingIn(assembly: Assembly, id: number): number[] {
  const { loaded, leagues, picks, parents } = assembly;
  const owners = [
    ...leagues.members.of(id),
    ...loaded.predictions.of(id).map(({ user }) => user),
    ...loaded.standings.of(id).map(({ user }) => user),
    ...picks.of(id).map(({ user }) => user),
    ...loaded.matchPoints.of(id).map(({ user }) => user),
    ...loaded.standingsPoints.of(id).map(({ user }) => user),
    ...loaded.survivalPoints.of(id).map(({ user }) => user),
  ];
  return [...new Set(owners)]
    .filter((user) => parents.users.users.has(user))
    .sort((a, b) => a - b);
}

/** Each player's place in tournament `id`, from the global switch and their fill-ins. */
function tournamentPlayers(
  assembly: Assembly,
  id: number,
  playing: readonly number[],
): TournamentPlayer[] {
  const key = must(tournamentId(String(id)), 'tournament id');
  return playing.map((user): TournamentPlayer => {
    const isActive = assembly.settings.active.get(user);
    if (isActive === undefined) {
      throw new ReaderProblem('map: a loaded player has no user_settings');
    }
    const fillIns = assembly.loaded.predictions
      .of(id)
      .filter(
        (each) => each.user === user && each.prediction.origin === 'fill-in',
      ).length;
    const status = sportbetColumns.status({
      tournament: key,
      active: isActive,
      fillIns,
    });
    must(PlayerStatus.stored(status, sportbetRules), 'player status');
    return {
      player: playerOf(user),
      switchedOff: status.switchedOffIn.has(key),
      adminHidden: status.adminHidden,
      fillIns: status.fillIns.get(key) ?? 0,
    };
  });
}

/** Values grouped by their user, in the order found. */
function groupByUser<T>(
  rows: readonly (readonly [number, T])[],
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const [user, value] of rows) {
    grouped.set(user, [...(grouped.get(user) ?? []), value]);
  }
  return grouped;
}

/** Tournament `id`'s players' standings predictions and survival runs. */
function playerInputs(assembly: Assembly, id: number) {
  const standingsByUser = groupByUser(
    assembly.loaded.standings
      .of(id)
      .map(({ user, pick }) => [user, pick] as const),
  );
  const picksByUser = groupByUser(
    assembly.picks.of(id).map(({ user, pick }) => [user, pick] as const),
  );
  return {
    standings: [...standingsByUser].map(([user, rowsOfUser]) =>
      must(
        StandingsPrediction.stored(playerOf(user), rowsOfUser),
        'standings prediction',
      ),
    ),
    runs: new Map(
      [...picksByUser].map(([user, picksOfUser]) => [
        playerOf(user),
        must(SurvivalRun.stored(picksOfUser), 'survival run'),
      ]),
    ),
  };
}

/** When sportbet reminded each player of a game, for the predictions that were. */
function remindedOf(rows: readonly PredictionRow[]): RemindedRow[] {
  return rows.flatMap(({ user, prediction, remindedAt }) =>
    remindedAt === null
      ? []
      : [{ player: playerOf(user), game: prediction.game, at: remindedAt }],
  );
}

/** One loaded tournament, assembled from its mapped rows. */
function assembleTournament(
  assembly: Assembly,
  id: number,
  tournament: Tournament,
): { mapped: MappedTournament; playing: number[]; chosen: LeagueSelections } {
  const { parents, loaded } = assembly;
  const playing = playingIn(assembly, id);
  const chosen = selectLeagues(assembly.leagues, id, playing);
  const teamsOf = [...parents.teams.teams.values()].filter(
    (team) => team.tournament === id,
  );
  const profile = assembly.tournaments.profiles.get(id);
  if (profile === undefined) {
    throw new ReaderProblem('map: a loaded tournament has no profile');
  }
  const mapped: MappedTournament = {
    tournament,
    profile,
    teams: teamsOf.map(({ row }) => row),
    rounds: [...parents.rounds.rounds.values()]
      .filter((round) => round.tournament === id)
      .map(({ saved }) => saved),
    games: [...parents.games.games.values()]
      .filter((game) => game.tournament === id)
      .map(({ game }) => game),
    outcomes: must(
      TeamOutcomes.stored(
        teamsOf.map(({ outcome }) => outcome),
        tournament.standingsTableFinal,
      ),
      'team outcomes',
    ),
    players: tournamentPlayers(assembly, id, playing),
    predictions: loaded.predictions.of(id).map(({ prediction }) => prediction),
    reminded: remindedOf(loaded.predictions.of(id)),
    ...playerInputs(assembly, id),
    production: {
      odds: loaded.odds.of(id),
      matches: loaded.matchPoints.of(id).map(({ row }) => row),
      standings: loaded.standingsPoints.of(id).map(({ row }) => row),
      survival: loaded.survivalPoints.of(id).map(({ row }) => row),
    },
    leagues: [...assembly.leagues.saved.values()].filter(
      ({ league }) => assembly.leagues.tournamentOf.get(league.id) === id,
    ),
    selections: chosen.selections,
    leaguesAdded: chosen.added,
    refusedPoints: refusedPointsOf(assembly.ctx, parents, loaded, id),
  };
  return { mapped, playing, chosen };
}

/** Each loaded tournament, and every user who plays one of them. */
export function assembleTournaments(assembly: Assembly): {
  tournaments: MappedTournament[];
  loadedUsers: Set<number>;
} {
  const loadedUsers = new Set<number>();
  const tournaments: MappedTournament[] = [];
  const choices: LeagueSelections[] = [];
  for (const [id, tournament] of assembly.tournaments.tournaments) {
    const { mapped, playing, chosen } = assembleTournament(
      assembly,
      id,
      tournament,
    );
    for (const user of playing) loadedUsers.add(user);
    tournaments.push(mapped);
    choices.push(chosen);
  }
  noticeSelections(assembly.ctx, choices);
  return { tournaments, loadedUsers };
}

/** How the selected leagues were decided and what the saver adds (#29): numbers only. */
function noticeSelections(
  ctx: MapContext,
  choices: readonly LeagueSelections[],
): void {
  const total = (count: (each: LeagueSelections) => number) =>
    choices.reduce((sum, each) => sum + count(each), 0);
  ctx.notices.push(
    `league selections: ${String(total((each) => each.noneActive))} players had no active league (the public one is selected), ${String(total((each) => each.severalActive))} had several (the lowest member id is kept)`,
    `league memberships added: ${String(total((each) => each.added.members))} tournament players had no public membership, ${String(total((each) => each.added.leagues))} tournaments had no public league`,
  );
}

/** users and user_settings, counted now that the players are known. */
export function countAccounts(
  assembly: Pick<Assembly, 'ctx' | 'parents' | 'settings'>,
  loadedUsers: ReadonlySet<number>,
): void {
  const { ledger } = assembly.ctx;
  const { fates } = assembly.parents.users;
  for (const [id, fate] of fates) {
    if (fate.kind !== 'loaded') continue;
    if (loadedUsers.has(id)) ledger.load('users');
    else ledger.skip('users', 'in-no-loaded-tournament');
  }
  for (const [user, values] of assembly.settings.rowsOf) {
    // An orphan's rows and differing duplicates are counted already.
    const fate = assembly.settings.fateOf.get(user);
    if (fate === undefined || fate === 'refused') continue;
    const userFate = fates.get(user);
    values.forEach((_, index) => {
      if (index > 0) ledger.skip('user_settings', 'duplicate-equal');
      else if (userFate?.kind === 'refused') {
        ledger.refuse('user_settings', dependsOn(userFate.reason));
      } else if (loadedUsers.has(user)) ledger.load('user_settings');
      else ledger.skip('user_settings', 'user-not-loaded');
    });
  }
}

/** The loaded players' settings, by id. */
export function loadedSettingsOf(
  settings: MappedSettings,
  loadedUsers: ReadonlySet<number>,
): StoredPlayerSettings[] {
  return [...loadedUsers]
    .sort((a, b) => a - b)
    .map((id) => {
      const each = settings.settings.get(id);
      if (each === undefined) {
        throw new ReaderProblem('map: a loaded player has no settings');
      }
      return each;
    });
}

/** The loaded players who opted in to reminders (R-97), by id. */
function loadedReminderOptInsOf(
  settings: MappedSettings,
  loadedUsers: ReadonlySet<number>,
): PlayerId[] {
  return [...loadedUsers]
    .sort((a, b) => a - b)
    .filter((id) => settings.receiveReminders.get(id) === true)
    .map(playerOf);
}

/** A MySQL timestamp read as text (UTC); none when null or no timestamp, as league times are. */
function createdAtOf(text: string | null): Instant | null {
  if (text === null) return null;
  const instant = instantFrom(`${text.replace(' ', 'T')}Z`);
  return instant.ok ? instant.value : null;
}

/**
 * What the loaded players carry beyond the stored player: who opted in to
 * reminders (R-97), when each account was created (R-114, a missing time
 * leaves the moment of the load) and their chart colour (R-136).
 */
export function loadedAccountExtras(
  ctx: MapContext,
  users: MappedUsers,
  settings: MappedSettings,
  loadedUsers: ReadonlySet<number>,
): Pick<Mapped, 'reminderOptIns' | 'accountsCreated' | 'chartColours'> {
  return {
    reminderOptIns: loadedReminderOptInsOf(settings, loadedUsers),
    chartColours: mapColours(ctx, new Set(users.fates.keys()), loadedUsers),
    accountsCreated: ctx.rows.users.flatMap((row) => {
      const at = createdAtOf(row.created_at);
      return at === null || !loadedUsers.has(row.id)
        ? []
        : [{ player: playerOf(row.id), at }];
    }),
  };
}

/**
 * R-73: production's private leagues, their members and its guest
 * memberships; R-26 amended: how many loaded accounts hold each role.
 * Numbers only.
 */
export function noticeLeaguesAndRoles(
  ctx: MapContext,
  loadedSettings: readonly StoredPlayerSettings[],
): void {
  const { rows } = ctx;
  const privateLeagues = new Set(
    rows.leagues.filter((row) => row.is_public === 0).map((row) => row.id),
  );
  const privateMembers = rows.league_members.filter((row) =>
    privateLeagues.has(row.league_id),
  ).length;
  const guests = rows.league_members.filter((row) => row.is_guest > 0).length;
  ctx.notices.push(
    `leagues: ${String(privateLeagues.size)} private leagues with ${String(privateMembers)} members; ${String(guests)} guest memberships (R-73)`,
  );
  const roleCount = (role: Role) =>
    loadedSettings.filter((each) => each.role === role).length;
  ctx.notices.push(
    `player_settings: ${String(roleCount('player'))} players, ${String(roleCount('results-manager'))} results managers, ${String(roleCount('superadmin'))} superadmins (R-26 amended)`,
  );
}
