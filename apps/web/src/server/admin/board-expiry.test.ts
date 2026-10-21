import { ok } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FINISHED } from '../../components/admin/tournament-fixtures';

// An admin write expires the cached board exactly when its writer says the
// board changed (BoardEffect): every season write does (the public league
// reads the season), the recalculating ones too, a placeholder team or a new
// tournament does not.

const world = vi.hoisted(() => {
  const state: { answers: Record<string, unknown>; expired: number } = {
    answers: {},
    expired: 0,
  };
  return state;
});

const writer = (name: string) => () => Promise.resolve(world.answers[name]);

vi.mock('@sportbet/db', () => ({
  insertGame: writer('insertGame'),
  updateGame: writer('updateGame'),
  insertRound: writer('insertRound'),
  updateRound: writer('updateRound'),
  deleteRound: writer('deleteRound'),
  insertPlaceholderTeams: writer('insertPlaceholderTeams'),
  saveStandingsFacts: writer('saveStandingsFacts'),
  renameTeam: writer('renameTeam'),
}));
vi.mock('@sportbet/db/tournament', () => ({
  createTournament: writer('createTournament'),
  updateTournament: writer('updateTournament'),
  chooseAdminTournament: writer('chooseAdminTournament'),
}));
vi.mock('@sportbet/db/admin', () => ({
  findAdminTournament: () => Promise.resolve(FINISHED),
  loadAdminTeams: () => Promise.resolve({ teams: [] }),
}));
vi.mock('../../server/db', () => ({ getDb: () => 'db' }));
vi.mock('./working-tournament', () => ({
  workingTournament: () => Promise.resolve(FINISHED.tournament),
}));
vi.mock('../points-changed', () => ({
  expireBoard: <Written extends { boardChanged: boolean }>(
    written: Written,
  ): Written => {
    if (written.boardChanged) world.expired += 1;
    return written;
  },
}));
vi.mock('../sign-in/throttle', () => ({
  throttle: () => Promise.resolve({ allowed: true }),
}));

const { addGame, changeGame } = await import('./games');
const { addRound, saveRound } = await import('./rounds');
const { saveFacts, addPlaceholderTeams } = await import('./teams');
const { storeTournament, changeTournament } = await import('./tournaments');

const ADMIN = {
  player: player('1'),
  name: 'Jonas',
  surname: 'Petraitis',
  role: 'superadmin',
  lastTournament: null,
} as const;

const formOf = (fields: Record<string, string | readonly string[]>) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const each of typeof value === 'string' ? [value] : value) {
      form.append(name, each);
    }
  }
  return form;
};

const request = (fields: Record<string, string | readonly string[]>) => ({
  admin: ADMIN,
  form: formOf(fields),
});

const GAME = {
  gameDateTime: '2026-12-01T20:00',
  homeTeamID: '412',
  awayTeamID: '411',
  eventID: '5',
};
const ROUND = { event: '6 turas', eventDay: '6', stage: 'regular', rate: '1' };
const FACTS = {
  teamID: ['411', '412'],
  place: ['1', '2'],
  finalPlace: ['', ''],
};
const TOURNAMENT = {
  name: 'Euroleague 2028/29',
  slug: 'euroleague-2028-29',
  status: 'upcoming',
  standings_deadline_round: '',
  start_date: '2028-10-01',
  end_date: '2029-05-30',
  description: '',
  is_public: '1',
};

const MOVED = ok({ boardChanged: true });
const STILL = ok({ boardChanged: false });

beforeEach(() => {
  world.answers = {};
  world.expired = 0;
});

describe('an admin write expires the cached board only when its writer says the board changed', () => {
  it('games: every write expires, an update of an unscored game too (the season changed)', async () => {
    world.answers['insertGame'] = ok({ game: 9, boardChanged: true });
    await addGame(request(GAME));
    expect(world.expired).toBe(1);
    world.answers['updateGame'] = MOVED;
    await changeGame(request({ ...GAME, gameID: '9' }));
    expect(world.expired).toBe(2);
  });

  it('rounds: an insert, a delete and an update all expire', async () => {
    world.answers['insertRound'] = ok({ round: 3, boardChanged: true });
    await addRound(request(ROUND));
    world.answers['deleteRound'] = MOVED;
    await saveRound(request({ eventID: '3', delete: '1' }));
    world.answers['updateRound'] = MOVED;
    await saveRound(request({ ...ROUND, eventID: '3' }));
    expect(world.expired).toBe(3);
  });

  it('writes whose writer says nothing changed expire nothing', async () => {
    world.answers['updateGame'] = STILL;
    await changeGame(request({ ...GAME, gameID: '9' }));
    world.answers['updateRound'] = STILL;
    await saveRound(request({ ...ROUND, eventID: '3' }));
    expect(world.expired).toBe(0);
  });

  it('teams: placeholder teams expire nothing; the standings facts expire', async () => {
    world.answers['insertPlaceholderTeams'] = ok({ teams: [1, 2] });
    await addPlaceholderTeams(request({ teamCount: '2' }));
    expect(world.expired).toBe(0);
    world.answers['saveStandingsFacts'] = MOVED;
    await saveFacts(request({ ...FACTS, final: '1' }));
    expect(world.expired).toBe(1);
  });

  it('tournaments: a new one expires nothing; an edit expires (the public switch is read by the board)', async () => {
    world.answers['createTournament'] = ok(FINISHED.tournament);
    await storeTournament(request(TOURNAMENT));
    expect(world.expired).toBe(0);
    world.answers['updateTournament'] = ok({
      tournament: FINISHED.tournament,
      boardChanged: true,
    });
    await changeTournament(request(TOURNAMENT), '41');
    expect(world.expired).toBe(1);
  });
});
