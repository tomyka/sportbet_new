// A small tournament saved through the repositories, shared by the db
// repository tests. Ids are chosen, not generated, as the reader chooses
// sportbet's.

import { Game, Round, type PlayerId, type Tournament } from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  rate,
  roundNo,
  score,
  team,
  testPlayer,
  unwrap,
} from '@sportbet/domain/testing';
import { savePlayers, type Db, type TeamRow } from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { saveRounds } from '../src/season/repository';
import { saveTeams } from '../src/team/repository';
import { saveTournament } from '../src/tournament/repository';

export const TOURNAMENT: Tournament = {
  id: 3,
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};

/** Another tournament, for rows that must not leak across. */
export const OTHER: Tournament = {
  ...TOURNAMENT,
  id: 4,
  slug: 'euroleague-2027-28',
  name: 'Euroleague 2027/28',
  endsOn: '2028-05-21',
};

export const ZAL = team('11');
export const OLY = team('12');
export const REA = team('13');
export const FEN = team('14');
export const TEAMS: readonly TeamRow[] = [
  { id: ZAL, name: 'Zalgiris' },
  { id: OLY, name: 'Olympiacos' },
  { id: REA, name: 'Real' },
  { id: FEN, name: 'Fenerbahce' },
];

export const ADA = player('1');
export const BEN = player('2');
export const CAI = player('3');

/** Round 1 (id 21) and a knockout-flagged round 2 at rate 2 (id 22). */
export const ROUNDS = [
  {
    id: 21,
    name: '1 turas',
    round: Round.stored({
      number: roundNo(1),
      stage: 'regular',
      rate: rate(1),
      survival: true,
      knockout: false,
    }),
  },
  {
    id: 22,
    name: '2 turas',
    round: Round.stored({
      number: roundNo(2),
      stage: 'regular',
      rate: rate(2),
      survival: false,
      knockout: true,
    }),
  },
] as const;

/** Game 7 is scored; 8 level with a recorded winner; 9 postponed; 10 locked after a move. */
export const G7 = unwrap(
  Game.stored({
    id: gameNo(7),
    round: roundNo(1),
    home: ZAL,
    away: OLY,
    tipOff: at('2026-10-02T18:00:00Z'),
    result: score(88, 79),
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);
export const G8 = unwrap(
  Game.stored({
    id: gameNo(8),
    round: roundNo(2),
    home: REA,
    away: FEN,
    tipOff: at('2026-10-09T18:45:00Z'),
    result: score(80, 80),
    recordedWinner: FEN,
    lockedSince: null,
    postponed: false,
  }),
);
export const G9 = unwrap(
  Game.stored({
    id: gameNo(9),
    round: roundNo(2),
    home: ZAL,
    away: FEN,
    tipOff: at('2026-10-10T17:30:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: true,
  }),
);
export const G10 = unwrap(
  Game.stored({
    id: gameNo(10),
    round: roundNo(1),
    home: REA,
    away: OLY,
    tipOff: at('2026-10-20T18:00:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: at('2026-10-03T18:00:00Z'),
    postponed: false,
  }),
);
/**
 * Game 10 as it stood before its move: not locked, so still open until its
 * tip-off (2026-10-20). For the prediction tests, which need an open game in
 * round 1; GAMES keeps the locked game 10.
 */
export const G10_OPEN = unwrap(
  Game.stored({
    id: gameNo(10),
    round: roundNo(1),
    home: REA,
    away: OLY,
    tipOff: at('2026-10-20T18:00:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);
export const GAMES = [G7, G8, G9, G10];

/**
 * Makes `players` players of `tournament` (tournament_players), as every
 * save of a player's rows needs them to be.
 */
export async function savePlaying(
  db: Db,
  tournament: Tournament,
  ...players: readonly PlayerId[]
): Promise<void> {
  await saveTournamentPlayers(
    db,
    tournament,
    players.map((player) => ({
      player,
      switchedOff: false,
      adminHidden: false,
      fillIns: 0,
    })),
  );
}

/** Saves the tournament, its teams and rounds, and three players. */
export async function saveWorld(db: Db): Promise<void> {
  await saveTournament(db, TOURNAMENT);
  await saveTeams(db, TOURNAMENT, TEAMS);
  await saveRounds(db, TOURNAMENT, ROUNDS);
  await savePlayers(db, [
    testPlayer(ADA, 'ada'),
    testPlayer(BEN, 'ben'),
    testPlayer(CAI, 'cai'),
  ]);
}
