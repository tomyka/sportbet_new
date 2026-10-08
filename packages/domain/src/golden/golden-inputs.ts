// The golden scenario's domain inputs (goldenInputs), and its stored odds and
// survival rows read back as a full recalculation reads production's. Test
// support, exported by src/testing.ts with the rest of the scenario.

import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
import { Points } from '../points/points';
import { MatchPrediction } from '../prediction/match-prediction';
import type {
  StoredSurvivalRow,
  TournamentInputs,
} from '../recalculation/recalculation';
import { Game } from '../round/game';
import { Round } from '../round/round';
import { Season } from '../round/season';
import { roundNumber, type GameId, type PlayerId } from '../shared/ids';
import { dayAfter, instantFrom } from '../shared/instant';
import { Rate, Score } from '../score/score';
import {
  StandingsPrediction,
  type StoredTeamPick,
} from '../standings/standings-prediction';
import { TeamOutcomes } from '../standings/team-outcomes';
import { SurvivalRun } from '../survival/survival-run';
import {
  GOLDEN,
  must,
  NAME_IDS,
  type GoldenIds,
  type GoldenSnapshot,
  type GoldenStandingsRow,
  type GoldenStoredRows,
} from './golden-scenario';

/** A non-negative "12.0000" or "0.5900" as hundredths, exactly. */
const hundredths = (fourPlaces: string | undefined): number => {
  const match = /^(\d+)\.(\d{2})00$/.exec(fourPlaces ?? '');
  if (match === null)
    throw new Error(`golden: bad column ${String(fourPlaces)}`);
  return Number(match[1]) * 100 + Number(match[2]);
};

/** "EL h2" as the golden game 2. */
const goldenGame = (key: string): 1 | 2 | 3 => {
  const found = GOLDEN.games.find(({ id }) => key === `EL h${String(id)}`);
  if (found === undefined) throw new Error(`golden: bad game key ${key}`);
  return found.id;
};

const nameOf = <N extends string>(names: readonly N[], value: string): N => {
  const found = names.find((name) => name === value);
  if (found === undefined) throw new Error(`golden: unknown name ${value}`);
  return found;
};

/** The stored odds rows of a snapshot, keyed by the consumer's game ids. */
export function goldenOdds(
  rows: GoldenSnapshot['game_odds'],
  ids: GoldenIds = NAME_IDS,
): ReadonlyMap<GameId, CrowdOdds> {
  return new Map(
    Object.entries(rows).map(([key, odds]) => [
      ids.game(goldenGame(key)),
      CrowdOdds.stored(
        must(Odds.ofHundredths(hundredths(odds['home_odds']))),
        must(Odds.ofHundredths(hundredths(odds['away_odds']))),
        must(Odds.ofHundredths(hundredths(odds['draw_odds']))),
      ),
    ]),
  );
}

/**
 * The stored survival rows of a snapshot, numbered from 1 in key order, as
 * the consumer's ids.
 */
export function goldenSurvivalRows(
  rows: GoldenSnapshot['point_survivals'],
  ids: GoldenIds = NAME_IDS,
): StoredSurvivalRow[] {
  return Object.entries(rows).map(([key, stored], index) => {
    const [name, round] = key.split(' / EL E');
    if (name === undefined || round === undefined) {
      throw new Error(`golden: bad survival key ${key}`);
    }
    return {
      id: index + 1,
      player: ids.player(nameOf(GOLDEN.players, name)),
      round: must(roundNumber(Number(round))),
      team: ids.team(nameOf(GOLDEN.teams, stored['team_id'] ?? '')),
      storedPoints: must(
        Points.ofHundredths(hundredths(stored['survival_points'])),
      ),
    };
  });
}

/** The golden season: its rounds (rate 1, survival on) and its scored games. */
function goldenSeason(ids: GoldenIds): Season {
  const rounds = GOLDEN.rounds.map((round) =>
    Round.stored({
      number: must(roundNumber(round.number)),
      stage: 'regular',
      rate: Rate.ONE,
      survival: true,
      knockout: round.knockout,
    }),
  );
  const games = GOLDEN.games.map((spec) =>
    must(
      Game.stored({
        id: ids.game(spec.id),
        round: must(roundNumber(spec.round)),
        home: ids.team(spec.home),
        away: ids.team(spec.away),
        tipOff: must(instantFrom(spec.tipOff)),
        result: must(Score.of(spec.result[0], spec.result[1])),
        recordedWinner: null,
        lockedSince: null,
        postponed: false,
      }),
    ),
  );
  return must(
    Season.create({ rounds, games, endsAt: must(dayAfter(GOLDEN.endsOn)) }),
  );
}

/** Every golden prediction, each a real call. */
function goldenPredictions(ids: GoldenIds): MatchPrediction[] {
  return GOLDEN.predictions.map(([name, game, home, away]) =>
    must(
      MatchPrediction.stored({
        player: ids.player(name),
        game: ids.game(game),
        home,
        away,
        origin: 'real',
        filledInAt: null,
      }),
    ),
  );
}

/** Survival from the pick history, unless stored rows are given. */
function goldenSurvival(
  stored: GoldenStoredRows,
  ids: GoldenIds,
): TournamentInputs['survival'] {
  if (stored.point_survivals !== undefined) {
    return {
      from: 'stored-rows',
      rows: goldenSurvivalRows(stored.point_survivals, ids),
    };
  }
  return {
    from: 'picks',
    runs: new Map(
      GOLDEN.survival.map(([name, picks]): [PlayerId, SurvivalRun] => [
        ids.player(name),
        must(
          SurvivalRun.stored(
            picks.map(([round, team]) => ({
              round: must(roundNumber(round)),
              team: ids.team(team),
            })),
          ),
        ),
      ]),
    ),
  };
}

/** Every golden standings prediction, places and play-off ticks only. */
function goldenStandings(ids: GoldenIds): StandingsPrediction[] {
  const pick = (row: GoldenStandingsRow): StoredTeamPick => ({
    team: ids.team(row.team),
    place: row.place,
    playOffs: row.playOffs,
    finalFour: null,
    finalPlace: null,
  });
  return GOLDEN.standings.map(([name, rows]) =>
    must(StandingsPrediction.stored(ids.player(name), rows.map(pick))),
  );
}

/** The teams' outcomes: places and play-offs, no later stage decided. */
function goldenOutcomes(ids: GoldenIds): TeamOutcomes {
  return must(
    TeamOutcomes.stored(
      GOLDEN.outcomes.map((outcome) => ({
        team: ids.team(outcome.team),
        place: outcome.place,
        playOffs: outcome.playOffs,
        finalFour: false,
        finalPlace: null,
      })),
      GOLDEN.tableIsFinal,
    ),
  );
}

/**
 * The golden tournament's inputs, built from its stored rows. The odds come
 * from the votes and survival from the pick history, as result entry makes
 * them, unless `stored` gives the rows a full recalculation reads instead.
 */
export function goldenInputs(
  stored: GoldenStoredRows = {},
  ids: GoldenIds = NAME_IDS,
): TournamentInputs {
  return {
    season: goldenSeason(ids),
    players: GOLDEN.players.map((name) => ids.player(name)),
    predictions: goldenPredictions(ids),
    odds:
      stored.game_odds === undefined
        ? 'from-votes'
        : goldenOdds(stored.game_odds, ids),
    survival: goldenSurvival(stored, ids),
    standings: goldenStandings(ids),
    outcomes: goldenOutcomes(ids),
  };
}
