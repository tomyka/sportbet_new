import { playerOf, type TournamentPlayer } from '@sportbet/db';
import {
  PlayerStatus,
  sportbetColumns,
  sportbetRules,
  StandingsPrediction,
  SurvivalRun,
  TeamOutcomes,
  tournamentId,
  type Role,
  type StoredPlayerSettings,
  type Tournament,
} from '@sportbet/domain';
import { ReaderProblem } from '../problem';
import type { MappedLeagues, MappedSettings } from './accounts';
import { dependsOn, must, type MapContext, type PerTournament } from './ledger';
import type { Parents, SurvivalPickRow } from './player-rows';
import { refusedPointsOf, type LoadedRows } from './points';
import type { MappedTournaments } from './structure';
import type { MappedTournament } from './types';

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

/** One loaded tournament, assembled from its mapped rows. */
function assembleTournament(
  assembly: Assembly,
  id: number,
  tournament: Tournament,
): { mapped: MappedTournament; playing: number[] } {
  const { parents, loaded } = assembly;
  const playing = playingIn(assembly, id);
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
    ...playerInputs(assembly, id),
    production: {
      odds: loaded.odds.of(id),
      matches: loaded.matchPoints.of(id).map(({ row }) => row),
      standings: loaded.standingsPoints.of(id).map(({ row }) => row),
      survival: loaded.survivalPoints.of(id).map(({ row }) => row),
    },
    leagues: [...assembly.leagues.tournamentOf]
      .filter(([, of]) => of === id)
      .map(([league]) => ({
        id: league,
        members: assembly.leagues.membersOf.get(league) ?? [],
      })),
    refusedPoints: refusedPointsOf(assembly.ctx, parents, loaded, id),
  };
  return { mapped, playing };
}

/** Each loaded tournament, and every user who plays one of them. */
export function assembleTournaments(assembly: Assembly): {
  tournaments: MappedTournament[];
  loadedUsers: Set<number>;
} {
  const loadedUsers = new Set<number>();
  const tournaments: MappedTournament[] = [];
  for (const [id, tournament] of assembly.tournaments.tournaments) {
    const { mapped, playing } = assembleTournament(assembly, id, tournament);
    for (const user of playing) loadedUsers.add(user);
    tournaments.push(mapped);
  }
  return { tournaments, loadedUsers };
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
