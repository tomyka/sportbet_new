import type { Game } from '../round/game';
import { Round } from '../round/round';
import { stageRate, type AdminRound } from '../round/round-admin';
import type { Season } from '../round/season';
import type { GameId, RoundNumber, TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuseWith, type DetailedResult } from '../shared/result';
import { hasCrest, teamNameKey } from '../team/crests';
import type { EuroleagueFixture } from './euroleague-feed';

/**
 * R-129 (settled 2026-10-15, replacing sportbet's survival off and the
 * plan's first default): whether a round the import creates plays survival.
 * `tournament` copies the tournament's survival switch; `off` is sportbet's.
 * Only this constant changes between the two; both are tested.
 */
export type ImportedRoundSurvival = 'off' | 'tournament';
export const IMPORTED_ROUND_SURVIVAL: ImportedRoundSurvival = 'tournament';

export function importedRoundSurvival(
  policy: ImportedRoundSurvival,
  tournamentSurvival: boolean,
): boolean {
  return policy === 'tournament' && tournamentSurvival;
}

export interface ImportTeam {
  readonly id: TeamId;
  readonly name: string;
}

export interface ImportInput {
  readonly fixtures: readonly EuroleagueFixture[];
  readonly postSeasonLeftOut: number;
  /** The tournament's teams, in id order. */
  readonly teams: readonly ImportTeam[];
  /** The tournament's rounds (with their stage) and every game. */
  readonly season: Season;
  readonly playerCount: number;
  /** The tournament's survival switch, for `IMPORTED_ROUND_SURVIVAL`. */
  readonly survivalPlayed: boolean;
  readonly finished: boolean;
  readonly now: Instant;
}

export type ImportRefusal =
  | { readonly kind: 'tournament-finished' }
  | { readonly kind: 'duplicate-team-names'; readonly team: string }
  | { readonly kind: 'unmatched-teams'; readonly teams: readonly string[] }
  | { readonly kind: 'round-not-regular'; readonly round: number }
  | {
      readonly kind: 'duplicate-fixture';
      readonly round: number;
      readonly home: string;
      readonly away: string;
    };

/** Why a game the feed moves is left where it is. */
export type SkipReason = 'scored' | 'postponed' | 'locked';

/** A game to insert; `home` and `away` are club names, matched by `teamNameKey`. */
export interface PlannedGame {
  readonly round: RoundNumber;
  readonly home: string;
  readonly away: string;
  readonly tipOff: Instant;
}

/** An open game moved to the feed's tip-off, as `Game.reschedule` leaves it. */
export interface PlannedMove {
  readonly game: GameId;
  readonly label: string;
  readonly from: Instant;
  readonly to: Instant;
  readonly lockedSince: Instant | null;
  readonly postponed: boolean;
}

export interface SkippedMove {
  readonly game: GameId;
  readonly label: string;
  readonly from: Instant;
  readonly to: Instant;
  readonly reason: SkipReason;
}

/** R-94: a game of a regular-season round the feed no longer lists. */
export interface DroppedGame {
  readonly game: GameId;
  readonly label: string;
  readonly round: RoundNumber;
  readonly tipOff: Instant;
}

export interface ImportPlan {
  /** Club names with no team in the tournament yet, by their key. */
  readonly teamsToCreate: readonly string[];
  readonly roundsToCreate: readonly AdminRound[];
  readonly gamesToCreate: readonly PlannedGame[];
  readonly moves: readonly PlannedMove[];
  readonly skippedMoves: readonly SkippedMove[];
  readonly unchanged: number;
  readonly dropped: readonly DroppedGame[];
  readonly postSeasonLeftOut: number;
  /** R-96: every team the plan ends with that has no committed crest. */
  readonly teamsWithoutCrest: readonly string[];
  readonly playersAffected: number;
}

/** sportbet's `isNoop`: nothing to create or move. */
export function isNoop(plan: ImportPlan): boolean {
  return (
    plan.teamsToCreate.length === 0 &&
    plan.roundsToCreate.length === 0 &&
    plan.gamesToCreate.length === 0 &&
    plan.moves.length === 0
  );
}

const keyOf = (name: string): string => teamNameKey(name) ?? '';
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const labelOf = (home: string, away: string): string => `${home} - ${away}`;
const gameKeyOf = (round: number, home: TeamId, away: TeamId): string =>
  `${String(round)}:${home}:${away}`;

type TeamsByKey = ReadonlyMap<string, ImportTeam>;

/** The tournament's teams by key (existingTeams, 410-430); two with one key refuse. */
function teamsByKey(
  teams: readonly ImportTeam[],
): DetailedResult<TeamsByKey, ImportRefusal> {
  const byKey = new Map<string, ImportTeam>();
  for (const team of teams) {
    const key = keyOf(team.name);
    if (byKey.has(key)) {
      return refuseWith({ kind: 'duplicate-team-names', team: team.name });
    }
    byKey.set(key, team);
  }
  return ok(byKey);
}

/** The feed's clubs, sorted by key; the last spelling of a key wins (clubs, 359-371). */
function clubsOf(fixtures: readonly EuroleagueFixture[]): readonly string[] {
  const clubs = new Map<string, string>();
  for (const fixture of fixtures) {
    clubs.set(keyOf(fixture.home), fixture.home);
    clubs.set(keyOf(fixture.away), fixture.away);
  }
  return [...clubs.entries()]
    .sort(([a], [b]) => byText(a, b))
    .map(([, name]) => name);
}

/**
 * The clubs to create (teamsToCreate, 173-191): every one when the
 * tournament has no team, none when it has teams and lacks a club - that
 * refuses, naming them.
 */
function missingClubs(
  clubs: readonly string[],
  existing: TeamsByKey,
): DetailedResult<readonly string[], ImportRefusal> {
  const missing = clubs.filter((club) => !existing.has(keyOf(club)));
  if (existing.size > 0 && missing.length > 0) {
    return refuseWith({ kind: 'unmatched-teams', teams: missing });
  }
  return ok(missing);
}

/** R-94: a feed round the tournament holds as another stage refuses. */
function roundsCheck(
  fixtures: readonly EuroleagueFixture[],
  season: Season,
): DetailedResult<readonly RoundNumber[], ImportRefusal> {
  const numbers = [...new Set(fixtures.map((fixture) => fixture.round))].sort(
    (a, b) => a - b,
  );
  const offender = numbers.find(
    (number) => (season.round(number)?.stage ?? 'regular') !== 'regular',
  );
  return offender === undefined
    ? ok(numbers)
    : refuseWith({ kind: 'round-not-regular', round: offender });
}

/** A (round, home, away) the feed lists twice would break the unique index. */
function duplicateFixture(
  fixtures: readonly EuroleagueFixture[],
): ImportRefusal | null {
  const seen = new Set<string>();
  for (const fixture of fixtures) {
    const key = `${String(fixture.round)}:${keyOf(fixture.home)}:${keyOf(fixture.away)}`;
    if (seen.has(key)) {
      return {
        kind: 'duplicate-fixture',
        round: fixture.round,
        home: fixture.home,
        away: fixture.away,
      };
    }
    seen.add(key);
  }
  return null;
}

function newRound(number: RoundNumber, survival: boolean): AdminRound {
  return {
    name: `${String(number)} turas`,
    round: Round.stored({
      number,
      stage: 'regular',
      rate: stageRate('regular'),
      survival,
      knockout: false,
    }),
  };
}

interface Compared {
  readonly game: Game;
  readonly label: string;
  readonly to: Instant;
}

/** R-13: a game the feed moves moves only while open; else it is skipped with its reason. */
function decide(
  { game, label, to }: Compared,
  input: ImportInput,
): PlannedMove | SkippedMove {
  const skip = (reason: SkipReason): SkippedMove => ({
    game: game.id,
    label,
    from: game.tipOff,
    to,
    reason,
  });
  if (game.result !== null) return skip('scored');
  if (game.postponed) return skip('postponed');
  if (!game.isOpenAt(input.now)) return skip('locked');
  const moved = game.reschedule(to, input.now);
  return {
    game: game.id,
    label,
    from: game.tipOff,
    to: moved.tipOff,
    lockedSince: moved.lockedSince,
    postponed: moved.postponed,
  };
}

interface Synced {
  readonly gamesToCreate: PlannedGame[];
  readonly moves: PlannedMove[];
  readonly skippedMoves: SkippedMove[];
  unchanged: number;
  readonly matched: Set<GameId>;
}

/** Each fixture against the tournament's game of its round, home and away (plan, 73-102). */
function syncGames(input: ImportInput, existing: TeamsByKey): Synced {
  const games = new Map<string, Game>();
  for (const game of input.season.games) {
    games.set(gameKeyOf(game.round, game.home, game.away), game);
  }
  const synced: Synced = {
    gamesToCreate: [],
    moves: [],
    skippedMoves: [],
    unchanged: 0,
    matched: new Set<GameId>(),
  };
  for (const fixture of input.fixtures) {
    const home = existing.get(keyOf(fixture.home));
    const away = existing.get(keyOf(fixture.away));
    const game =
      home === undefined || away === undefined
        ? undefined
        : games.get(gameKeyOf(fixture.round, home.id, away.id));
    if (game === undefined) {
      synced.gamesToCreate.push({
        round: fixture.round,
        home: fixture.home,
        away: fixture.away,
        tipOff: fixture.tipOff,
      });
      continue;
    }
    synced.matched.add(game.id);
    if (game.tipOff === fixture.tipOff) {
      synced.unchanged += 1;
      continue;
    }
    const label = labelOf(fixture.home, fixture.away);
    const decided = decide({ game, label, to: fixture.tipOff }, input);
    if ('reason' in decided) synced.skippedMoves.push(decided);
    else synced.moves.push(decided);
  }
  return synced;
}

/** R-94: games of regular-season rounds that no fixture matches, by round then tip-off. */
function droppedGames(
  input: ImportInput,
  matched: ReadonlySet<GameId>,
): readonly DroppedGame[] {
  const names = new Map(input.teams.map((team) => [team.id, team.name]));
  return input.season.games
    .filter(
      (game) =>
        !matched.has(game.id) &&
        input.season.round(game.round)?.stage === 'regular',
    )
    .map((game) => ({
      game: game.id,
      label: labelOf(
        names.get(game.home) ?? String(game.home),
        names.get(game.away) ?? String(game.away),
      ),
      round: game.round,
      tipOff: game.tipOff,
    }))
    .sort(
      (a, b) => a.round - b.round || a.tipOff - b.tipOff || a.game - b.game,
    );
}

/** R-96: the teams the plan ends with whose name finds no committed crest. */
function crestless(
  existing: TeamsByKey,
  created: readonly string[],
): readonly string[] {
  const names = new Map<string, string>();
  for (const [key, team] of existing) names.set(key, team.name);
  for (const club of created) names.set(keyOf(club), club);
  return [...names.entries()]
    .filter(([, name]) => !hasCrest(name))
    .sort(([a], [b]) => byText(a, b))
    .map(([, name]) => name);
}

function sortedGames(games: readonly PlannedGame[]): readonly PlannedGame[] {
  return [...games].sort(
    (a, b) =>
      a.round - b.round ||
      a.tipOff - b.tipOff ||
      byText(keyOf(a.home), keyOf(b.home)) ||
      byText(keyOf(a.away), keyOf(b.away)),
  );
}

/**
 * Everything the Euroleague import would do to one tournament (R-93, R-94,
 * R-96, R-13, R-110), decided from what the tournament holds and the feed's
 * fixtures, and nothing written. Refusals come in sportbet's order.
 */
export function planEuroleagueImport(
  input: ImportInput,
): DetailedResult<ImportPlan, ImportRefusal> {
  if (input.finished) return refuseWith({ kind: 'tournament-finished' });
  const existing = teamsByKey(input.teams);
  if (!existing.ok) return existing;
  const created = missingClubs(clubsOf(input.fixtures), existing.value);
  if (!created.ok) return created;
  const rounds = roundsCheck(input.fixtures, input.season);
  if (!rounds.ok) return rounds;
  const duplicate = duplicateFixture(input.fixtures);
  if (duplicate !== null) return refuseWith(duplicate);

  const survival = importedRoundSurvival(
    IMPORTED_ROUND_SURVIVAL,
    input.survivalPlayed,
  );
  const synced = syncGames(input, existing.value);
  return ok({
    teamsToCreate: created.value,
    roundsToCreate: rounds.value
      .filter((number) => input.season.round(number) === undefined)
      .map((number) => newRound(number, survival)),
    gamesToCreate: sortedGames(synced.gamesToCreate),
    moves: synced.moves,
    skippedMoves: synced.skippedMoves,
    unchanged: synced.unchanged,
    dropped: droppedGames(input, synced.matched),
    postSeasonLeftOut: input.postSeasonLeftOut,
    teamsWithoutCrest: crestless(existing.value, created.value),
    playersAffected: input.playerCount,
  });
}

const iso = (instant: Instant): string => new Date(instant).toISOString();

/**
 * The plan as one stable text - lists sorted, ids and instants as strings -
 * which `db` hashes into the fingerprint R-93 compares. The same plan from
 * fixtures in another order gives the same text.
 */
export function canonicalPlan(plan: ImportPlan): string {
  return JSON.stringify({
    teamsToCreate: [...plan.teamsToCreate].sort((a, b) =>
      byText(keyOf(a), keyOf(b)),
    ),
    roundsToCreate: [...plan.roundsToCreate]
      .sort((a, b) => a.round.number - b.round.number)
      .map(({ name, round }) => ({
        name,
        number: round.number,
        stage: round.stage,
        rate: round.rate.value,
        survival: round.survival,
        knockout: round.knockout,
      })),
    gamesToCreate: sortedGames(plan.gamesToCreate).map((game) => ({
      round: game.round,
      home: keyOf(game.home),
      away: keyOf(game.away),
      tipOff: iso(game.tipOff),
    })),
    moves: [...plan.moves]
      .sort((a, b) => a.game - b.game)
      .map((move) => ({
        game: String(move.game),
        from: iso(move.from),
        to: iso(move.to),
        lockedSince: move.lockedSince === null ? null : iso(move.lockedSince),
        postponed: move.postponed,
      })),
    skippedMoves: [...plan.skippedMoves]
      .sort((a, b) => a.game - b.game)
      .map((skip) => ({
        game: String(skip.game),
        from: iso(skip.from),
        to: iso(skip.to),
        reason: skip.reason,
      })),
    unchanged: plan.unchanged,
    dropped: [...plan.dropped]
      .sort((a, b) => a.game - b.game)
      .map((drop) => ({ game: String(drop.game), tipOff: iso(drop.tipOff) })),
    postSeasonLeftOut: plan.postSeasonLeftOut,
    teamsWithoutCrest: [...plan.teamsWithoutCrest].sort(byText),
    playersAffected: plan.playersAffected,
  });
}
