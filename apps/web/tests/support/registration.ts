import { advanceIdentitySequences, saveTournamentSnapshot } from '@sportbet/db';
import type { Db } from '@sportbet/db/connection';
import {
  Game,
  instantFrom,
  Round,
  TeamOutcomes,
  type Instant,
  type NewTournament,
} from '@sportbet/domain';
import {
  gameNo,
  rate,
  roundNo,
  score,
  team,
  unwrap,
} from '@sportbet/domain/testing';
import { isoSecond } from '../../src/server/clock';
import type { Browser, Page } from './browser';
import { EUROLEAGUE_2025_26, EUROLEAGUE_2026_27 } from './tournaments';

// Tournaments the registration tests join, dated from the server's real
// clock, and the answers they register with. Test data only.

const DAY_MS = 86_400_000;

/** `days` from now (negative: ago), to the second. */
const inDays = (days: number): Instant =>
  unwrap(instantFrom(isoSecond(Date.now() + days * DAY_MS)));

export interface PlannedTournament {
  readonly id: number;
  readonly tournament: NewTournament;
  /** Days from now to its round-1 game. */
  readonly firstGameInDays: number;
  /** Days from now to its round-5 game, the one whose result closes the standings (ST-2). */
  readonly deadlineInDays: number;
  /** Its round-5 game has its result: the standings are closed (ST-2). */
  readonly standingsClosed?: boolean;
}

const EUROLEAGUE_2027_28: NewTournament = {
  ...EUROLEAGUE_2026_27,
  slug: 'euroleague-2027-28',
  name: 'Euroleague 2027/28',
  endsOn: '2028-05-21',
};

/** Open: its first game in a week. */
export const SOONER: PlannedTournament = {
  id: 41,
  tournament: EUROLEAGUE_2026_27,
  firstGameInDays: 7,
  deadlineInDays: 40,
};

/** Open: its first game in two weeks. */
export const LATER: PlannedTournament = {
  id: 42,
  tournament: EUROLEAGUE_2027_28,
  firstGameInDays: 14,
  deadlineInDays: 50,
};

/** Round 5 began yesterday, its game with no result yet: standings still open (ST-2), registration closed since its first game began (R-128); its end date is a year off. */
export const CLOSED: PlannedTournament = {
  id: 43,
  tournament: { ...EUROLEAGUE_2025_26, endsOn: '2027-05-23' },
  firstGameInDays: -30,
  deadlineInDays: -1,
};

/** CLOSED with round 5's result entered, which closes the standings (ST-2). */
export const CLOSED_BY_RESULT: PlannedTournament = {
  ...CLOSED,
  standingsClosed: true,
};

/**
 * Saves the tournament with two teams (id*10+1, +2), rounds 1 and 5
 * (id*10+1, +5) and one game in each (id*10+1, +5), unplayed, and moves
 * the identity sequences past every id.
 */
export async function saveTournamentWithGames(
  db: Db,
  plan: PlannedTournament,
): Promise<void> {
  const { id } = plan;
  const home = team(String(id * 10 + 1));
  const away = team(String(id * 10 + 2));
  const round = (number: number) => ({
    id: id * 10 + number,
    name: `${String(number)} turas`,
    round: Round.stored({
      number: roundNo(number),
      stage: 'regular',
      rate: rate(1),
      survival: false,
      knockout: false,
    }),
  });
  const game = (number: number, days: number, scored = false) => {
    const scheduled = unwrap(
      Game.schedule({
        id: gameNo(id * 10 + number),
        round: roundNo(number),
        home,
        away,
        tipOff: inDays(days),
      }),
    );
    return scored ? unwrap(scheduled.withResult(score(90, 80))) : scheduled;
  };
  await saveTournamentSnapshot(db, {
    tournament: { id, ...plan.tournament },
    teams: [
      { id: home, name: `Home ${String(id)}` },
      { id: away, name: `Away ${String(id)}` },
    ],
    rounds: [round(1), round(5)],
    games: [
      game(1, plan.firstGameInDays),
      game(5, plan.deadlineInDays, plan.standingsClosed === true),
    ],
    outcomes: unwrap(TeamOutcomes.stored([], false)),
    players: [],
    predictions: [],
    standings: [],
    runs: new Map(),
  });
  await advanceIdentitySequences(db);
}

/** A newcomer's answers, the address in its stored form. */
export const ANSWERS = {
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  email: 'ruta.naujoke@example.lt',
} as const;

/** Step one from the browser's own page, ANSWERS with `fields` over them. */
export async function startRegistration(
  browser: Browser,
  fields: Readonly<Record<string, string>> = {},
): Promise<Page> {
  return browser.submit(await browser.get('/'), 'register-request', {
    ...ANSWERS,
    ...fields,
  });
}
