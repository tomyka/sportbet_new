import {
  CrowdOdds,
  MatchPrediction,
  oddsPanel,
  Points,
  PREDICTION_ORIGINS,
  predictionRowState,
  predictionsRound,
  roundNumber,
  scoreSideInvariant,
  type GameId,
  type Instant,
  type OddsPanel,
  type PlayerId,
  type PredictionRowState,
  type RoundNumber,
  type RuleSet,
  type TeamId,
  type Tournament,
  type Vote,
} from '@sportbet/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { gameOf, keyOf, playerOf, stored, unitsOf } from '../edge';
import { matchPoints } from '../points/schema';
import { loadSeason } from '../season/repository';
import { games, rounds } from '../season/schema';
import { listTeams } from '../team/repository';
import { matchPredictions } from './schema';

/** A round in the page's menu: its id (sportbet's event id) and its name. */
export interface PredictionsMenuRound {
  readonly id: number;
  readonly name: string;
}

/** A scored row's points, as point_results stores them. */
export interface LinePoints {
  readonly winner: Points;
  readonly margin: Points;
  readonly bingo: Points;
  readonly serija: Points;
  readonly full: Points;
}

/** One row of the predictions page. */
export interface PredictionLine {
  readonly game: GameId;
  readonly round: RoundNumber;
  readonly roundName: string;
  readonly tipOff: Instant;
  readonly home: string;
  readonly away: string;
  /** The player's row: their scores, a fill-in's, or blank. */
  readonly predicted: {
    readonly home: number | null;
    readonly away: number | null;
  };
  readonly state: PredictionRowState;
  /** The game's result, on a scored row. */
  readonly result: { readonly home: number; readonly away: number } | null;
  /** The rule set's points row, on a scored row that has one. */
  readonly points: LinePoints | null;
  /** The odds panel from the game's votes now (CrowdOdds.forGame), on a row not yet scored. */
  readonly panel: OddsPanel | null;
}

export interface PredictionsPage {
  readonly rounds: readonly PredictionsMenuRound[];
  /** The menu's choice: a round's id, or "all". */
  readonly selected: number | 'all';
  readonly lines: readonly PredictionLine[];
}

const roundRows = z.array(
  z.object({ id: z.int(), number: z.int(), name: z.string() }),
);
const side = scoreSideInvariant.schema.nullable();
const ownRows = z.array(z.object({ game: z.int(), home: side, away: side }));
const voteRows = z.array(
  z.object({
    player: z.int(),
    game: z.int(),
    home: side,
    away: side,
    origin: z.enum(PREDICTION_ORIGINS),
  }),
);
const pointRows = z.array(
  z.object({
    game: z.int(),
    winner: z.string(),
    margin: z.string(),
    bingo: z.string(),
    serija: z.string(),
    full: z.string(),
  }),
);

/** The player's points rows of `ids` under the rule set (its own source), by game. */
async function pointsOf(
  db: Executor,
  player: number,
  ids: readonly GameId[],
  rules: RuleSet,
): Promise<Map<GameId, LinePoints>> {
  if (ids.length === 0) return new Map();
  const rows = pointRows.parse(
    await db
      .select({
        game: matchPoints.gameId,
        winner: matchPoints.winner,
        margin: matchPoints.margin,
        bingo: matchPoints.bingo,
        serija: matchPoints.serija,
        full: matchPoints.full,
      })
      .from(matchPoints)
      .where(
        and(
          eq(matchPoints.source, rules.name),
          eq(matchPoints.playerId, player),
          inArray(matchPoints.gameId, [...ids]),
        ),
      ),
  );
  return new Map(
    rows.map((row) => {
      const key = `${rules.name}/${String(player)}/${String(row.game)}`;
      const of = (value: string) =>
        stored(
          Points.ofHundredths(unitsOf(value, 2, 'match_points', key)),
          'match_points',
          key,
        );
      return [
        gameOf(row.game),
        {
          winner: of(row.winner),
          margin: of(row.margin),
          bingo: of(row.bingo),
          serija: of(row.serija),
          full: of(row.full),
        },
      ];
    }),
  );
}

/** Every player's vote on `ids` (CrowdOdds.forGame reads which count), by game. */
async function votesOf(
  db: Executor,
  ids: readonly GameId[],
): Promise<Map<GameId, Vote[]>> {
  const votes = new Map<GameId, Vote[]>();
  if (ids.length === 0) return votes;
  const rows = voteRows.parse(
    await db
      .select({
        player: matchPredictions.playerId,
        game: matchPredictions.gameId,
        home: matchPredictions.home,
        away: matchPredictions.away,
        origin: matchPredictions.origin,
      })
      .from(matchPredictions)
      .where(inArray(matchPredictions.gameId, [...ids])),
  );
  for (const row of rows) {
    const key = `${String(row.player)}/${String(row.game)}`;
    const prediction = stored(
      MatchPrediction.stored({
        player: playerOf(row.player),
        game: gameOf(row.game),
        home: row.home,
        away: row.away,
        origin: row.origin,
        filledInAt: null,
      }),
      'match_predictions',
      key,
    );
    const game = gameOf(row.game);
    votes.set(game, [
      ...(votes.get(game) ?? []),
      { origin: prediction.origin, outcome: prediction.outcome },
    ]);
  }
  return votes;
}

/**
 * getPredictionResultsUser: the player's own rows of the tournament's
 * games in the page's round (predictionsRound), each with its game's state
 * (predictionRowState), its result and the rule set's points on a scored
 * game, and the odds panel from the game's current votes on any other.
 * Odds are read, never stored: game_odds holds only what a scored game was
 * scored with (CO-7). The menu lists every round, by number then id.
 */
export async function loadPredictionsPage(
  db: Executor,
  input: {
    readonly player: PlayerId;
    readonly tournament: Tournament;
    /** `?event=`: a round's id, "all", or null. */
    readonly requested: string | null;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<PredictionsPage> {
  const { player, tournament, requested, now, rules } = input;
  const playerKey = keyOf(player, 'player');
  const season = await loadSeason(db, tournament);
  const numbered = roundRows
    .parse(
      await db
        .select({ id: rounds.id, number: rounds.number, name: rounds.name })
        .from(rounds)
        .where(eq(rounds.tournamentId, tournament.id))
        .orderBy(asc(rounds.number), asc(rounds.id)),
    )
    .map((row) => ({
      id: row.id,
      number: stored(roundNumber(row.number), 'rounds', row.id),
      name: row.name,
    }));
  const chosen = predictionsRound({
    requested,
    rounds: numbered,
    current: season.currentRound(now, rules),
  });
  const menu = numbered.map(({ id, name }) => ({ id, name }));
  if (chosen.kind === 'none') {
    return { rounds: menu, selected: Number(requested ?? 0), lines: [] };
  }
  const selected =
    chosen.kind === 'all'
      ? 'all'
      : (numbered.find(({ number }) => number === chosen.round)?.id ?? 'all');
  const own = ownRows.parse(
    await db
      .select({
        game: matchPredictions.gameId,
        home: matchPredictions.home,
        away: matchPredictions.away,
      })
      .from(matchPredictions)
      .innerJoin(games, eq(games.id, matchPredictions.gameId))
      .where(
        and(
          eq(matchPredictions.playerId, playerKey),
          eq(games.tournamentId, tournament.id),
        ),
      ),
  );
  const shown = own.flatMap((row) => {
    const game = season.game(gameOf(row.game));
    if (game === undefined) {
      throw new Error(`predictions: game ${String(row.game)} is not stored`);
    }
    return chosen.kind === 'all' || game.round === chosen.round
      ? [{ row, game }]
      : [];
  });
  const points = await pointsOf(
    db,
    playerKey,
    shown.map(({ game }) => game.id),
    rules,
  );
  const votes = await votesOf(
    db,
    shown.filter(({ game }) => game.result === null).map(({ game }) => game.id),
  );
  const names = new Map(
    (await listTeams(db, tournament)).map(({ id, name }) => [id, name]),
  );
  const nameOf = (team: TeamId): string => {
    const name = names.get(team);
    if (name === undefined) {
      throw new Error(`predictions: team ${team} of a game is not stored`);
    }
    return name;
  };
  const roundNames = new Map(
    numbered.map(({ number, name }) => [number, name]),
  );
  return {
    rounds: menu,
    selected,
    lines: shown.map(({ row, game }) => {
      const round = season.round(game.round);
      const roundName = roundNames.get(game.round);
      if (round === undefined || roundName === undefined) {
        throw new Error(
          `predictions: round ${String(game.round)} is not stored`,
        );
      }
      const state = predictionRowState(game, now);
      return {
        game: game.id,
        round: game.round,
        roundName,
        tipOff: game.tipOff,
        home: nameOf(game.home),
        away: nameOf(game.away),
        predicted: { home: row.home, away: row.away },
        state,
        result:
          game.result === null
            ? null
            : { home: game.result.home, away: game.result.away },
        points: state === 'scored' ? (points.get(game.id) ?? null) : null,
        panel:
          state === 'scored'
            ? null
            : oddsPanel(
                CrowdOdds.forGame(votes.get(game.id) ?? [], rules),
                round.rate,
              ),
      };
    }),
  };
}
