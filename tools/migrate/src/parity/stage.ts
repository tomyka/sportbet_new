import {
  loadInputsUnderRuleSet,
  loadPlayerStatuses,
  loadTournamentPoints,
  type Db,
} from '@sportbet/db';
import { sportbetRules, tournamentId } from '@sportbet/domain';
import type { Recalculation } from '../load';
import type { Mapped, RefusedPoints } from '../map';
import { ReaderProblem } from '../problem';
import { compareTournament } from './compare';
import {
  compareLeaderboard,
  compareRankings,
  type LeaderboardInput,
  type OldAppBoardRank,
  type OldAppRank,
} from './rankings';
import {
  describeTournament,
  namesOf,
  notCompared,
  parityReport,
  type ParityReport,
} from './report';
import { rulingsImpact } from './rulings';

export interface ParityInput {
  readonly tag: string;
  readonly backup: string;
  /** Production's copy as the reader mapped and loaded it: oracle (a). */
  readonly mapped: Mapped;
  /** The same copy after sportbet's own recalculation, mapped alike: oracle (b). */
  readonly oldApp: Mapped;
  /** sportbet's own rankings of every league (sportbet-app.ts). */
  readonly ranks: readonly OldAppRank[];
  /** sportbet's own /leaderboard over the Euroleague tournaments (sportbet-app.ts). */
  readonly leaderboard: readonly OldAppBoardRank[];
  /** The reader's recalculations: a tournament refused under sportbet is not compared. */
  readonly recalculations: readonly Recalculation[];
}

const merged = (a: RefusedPoints, b: RefusedPoints): RefusedPoints => ({
  matches: [...a.matches, ...b.matches],
  standings: [...a.standings, ...b.standings],
  survival: [...a.survival, ...b.survival],
  odds: [...a.odds, ...b.odds],
});

/**
 * The parity stage (spec 1, 3, 4): per loaded tournament, the new code's
 * stored sportbet rows against both oracles, the rulings one at a time, and
 * every league's ranking against sportbet's own, then /leaderboard over
 * every tournament when each was compared. Reads the loaded Postgres only;
 * writes nothing.
 */
export async function checkParity(
  db: Db,
  input: ParityInput,
): Promise<ParityReport> {
  const usernames = new Map(
    input.mapped.players.map(({ id, username }) => [id, username]),
  );
  const tournaments = [];
  // Every tournament's new-code rows for /leaderboard; null once one is
  // not compared, as a sum without it would be wrong.
  let board: LeaderboardInput['tournaments'][number][] | null = [];
  for (const each of input.mapped.tournaments) {
    const { tournament } = each;
    const refusal = input.recalculations.find(
      (done) => done.tournament === tournament.id && done.rules === 'sportbet',
    )?.refusal;
    if (refusal !== undefined && refusal !== null) {
      board = null;
      tournaments.push(
        notCompared(
          tournament.slug,
          `the sportbet recalculation was refused (${refusal})`,
        ),
      );
      continue;
    }
    const old = input.oldApp.tournaments.find(
      (other) => other.tournament.id === tournament.id,
    );
    if (old === undefined) {
      throw new ReaderProblem(
        `tournament ${String(tournament.id)} is missing from sportbet's recalculated copy`,
      );
    }
    const scored = new Set(
      each.games.filter(({ result }) => result !== null).map(({ id }) => id),
    );
    const tables = compareTournament({
      production: each.production,
      oldApp: old.production,
      newCode: await loadTournamentPoints(db, tournament, 'sportbet'),
      refused: merged(each.refusedPoints, old.refusedPoints),
      scored,
    });
    const rulings = await rulingsImpact(
      (rules) => loadInputsUnderRuleSet(db, tournament, rules),
      scored,
    );
    const key = tournamentId(String(tournament.id));
    if (!key.ok) {
      throw new ReaderProblem(
        `tournament ${String(tournament.id)} has no tournament id`,
      );
    }
    const statuses = await loadPlayerStatuses(db, tournament, sportbetRules);
    if (rulings.ok) {
      board?.push({
        tournament: key.value,
        points: rulings.value.base,
        statuses,
        isPublic: each.profile.isPublic,
      });
    } else {
      board = null;
    }
    tournaments.push(
      describeTournament({
        tournament: tournament.slug,
        tables,
        rulings,
        rankings: rulings.ok
          ? compareRankings({
              tournament: key.value,
              leagues: each.leagues,
              totals: rulings.value.base.totals,
              statuses,
              usernames,
              oldApp: input.ranks,
            })
          : [],
        names: namesOf(each, usernames),
      }),
    );
  }
  return parityReport(
    input.tag,
    input.backup,
    tournaments,
    input.oldApp.tables,
    board === null
      ? null
      : compareLeaderboard({
          tournaments: board,
          usernames,
          oldApp: input.leaderboard,
        }),
  );
}
