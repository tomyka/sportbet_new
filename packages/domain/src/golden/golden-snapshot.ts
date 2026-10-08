// The golden tournament's points as golden-points.json holds them
// (snapshotOf, goldenSnapshot). Test support, exported by src/testing.ts
// with the rest of the scenario.

import type { StandingsOdds } from '../points/odds';
import type { StandingsPoints } from '../points/standings-points';
import {
  recalculateTournament,
  type PointsRows,
  type TournamentInputs,
} from '../recalculation/recalculation';
import type { RuleSet } from '../rules/rule-set';
import type { GameId, PlayerId, TeamId } from '../shared/ids';
import type { StandingsLine } from '../standings/standings-scoring';
import { goldenInputs } from './golden-inputs';
import {
  GOLDEN,
  must,
  NAME_IDS,
  type GoldenIds,
  type GoldenSnapshot,
  type Name,
  type TeamName,
} from './golden-scenario';

const four = (twoPlaces: { toString(): string }) => `${twoPlaces.toString()}00`;
const line = (value: StandingsPoints | StandingsOdds | null) =>
  value === null ? null : value.toString();
const columns = (name: string, standings: StandingsLine) => ({
  [`${name}_points`]: line(standings.points),
  [`${name}_odds`]: line(standings.odds),
});

/** The consumer's ids named back as golden-points.json names them. */
interface GoldenNames {
  readonly player: (id: PlayerId) => Name;
  readonly team: (id: TeamId) => TeamName;
  readonly game: (id: GameId) => string;
}

function namesOf(ids: GoldenIds): GoldenNames {
  const named =
    <K, V>(names: ReadonlyMap<K, V>) =>
    (key: K): V => {
      const name = names.get(key);
      if (name === undefined) {
        throw new Error(`golden: no name for ${String(key)}`);
      }
      return name;
    };
  return {
    player: named(
      new Map(GOLDEN.players.map((name) => [ids.player(name), name])),
    ),
    team: named(new Map(GOLDEN.teams.map((name) => [ids.team(name), name]))),
    game: named(
      new Map(
        GOLDEN.games.map(({ id }) => [ids.game(id), `EL h${String(id)}`]),
      ),
    ),
  };
}

function oddsEntries(
  points: PointsRows,
  names: GoldenNames,
): GoldenSnapshot['game_odds'] {
  return Object.fromEntries(
    points.odds.map(({ game, odds }) => [
      names.game(game),
      {
        home_odds: four(odds.home),
        away_odds: four(odds.away),
        draw_odds: four(odds.draw),
      },
    ]),
  );
}

function resultEntries(
  points: PointsRows,
  names: GoldenNames,
): GoldenSnapshot['point_results'] {
  return Object.fromEntries(
    points.matches.map(({ player, game, points: match, serija }) => [
      `${names.player(player)} / ${names.game(game)}`,
      {
        winner_points: four(match.winner),
        difference_points: four(match.margin),
        bingo_points: four(match.bingo),
        full_points: four(match.full),
        odds: four(match.odds),
        streak_bonus: four(serija),
      },
    ]),
  );
}

/** Euroleague plays no last 16 or last 32: always null. */
function standingsEntries(
  points: PointsRows,
  names: GoldenNames,
): GoldenSnapshot['point_standings'] {
  return Object.fromEntries(
    points.standings.map((team) => [
      `${names.player(team.player)} / ${names.team(team.team)}`,
      {
        ...columns('group_position', team.place),
        ...columns('quarterfinal', team.playOffs),
        ...columns('semifinal', team.finalFour),
        ...columns('final', team.final),
        last16_points: null,
        last16_odds: null,
        last32_points: null,
        last32_odds: null,
      },
    ]),
  );
}

function survivalEntries(
  points: PointsRows,
  names: GoldenNames,
): GoldenSnapshot['point_survivals'] {
  return Object.fromEntries(
    points.survival.map((survival) => [
      `${names.player(survival.player)} / EL E${String(survival.round)}`,
      {
        survival_points:
          survival.points === null ? 'pending' : four(survival.points),
        team_id: names.team(survival.team),
      },
    ]),
  );
}

/**
 * Stored points rows in golden-points.json's shape, each key and team named
 * back from the consumer's ids.
 */
export function snapshotOf(
  points: PointsRows,
  ids: GoldenIds = NAME_IDS,
): GoldenSnapshot {
  const names = namesOf(ids);
  return {
    point_results: resultEntries(points, names),
    point_standings: standingsEntries(points, names),
    point_survivals: survivalEntries(points, names),
    game_odds: oddsEntries(points, names),
  };
}

/** The golden tournament recalculated under `rules`, as golden-points.json. */
export function goldenSnapshot(
  rules: RuleSet,
  inputs: TournamentInputs = goldenInputs(),
  ids: GoldenIds = NAME_IDS,
): GoldenSnapshot {
  return snapshotOf(must(recalculateTournament(inputs, rules)), ids);
}

/** How many entries a snapshot holds, over its four tables. */
export function snapshotEntries(snapshot: GoldenSnapshot): number {
  return (
    Object.keys(snapshot.point_results).length +
    Object.keys(snapshot.point_standings).length +
    Object.keys(snapshot.point_survivals).length +
    Object.keys(snapshot.game_odds).length
  );
}
