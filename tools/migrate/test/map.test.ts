import { Odds } from '@sportbet/domain';
import {
  GOLDEN,
  GOLDEN_POINTS,
  goldenInputs,
  snapshotOf,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { mapSportbet, type Mapped, type MappedTournament } from '../src/map';
import { ReaderProblem } from '../src/problem';
import type { SportbetTable } from '../src/read-columns';
import type { DumpTable } from './fixtures/create-tables';
import {
  DUMP_IDS,
  EUROLEAGUE,
  IDS,
  readRows,
  syntheticDump,
  UNSCORED_GAME,
  type Dump,
  type DumpRow,
} from './fixtures/sportbet-dump';

const map = (dump: Dump = syntheticDump()) => mapSportbet(readRows(dump));

/** The dump with one table's rows changed. */
function changed(
  table: DumpTable,
  rows: (current: readonly DumpRow[]) => readonly DumpRow[],
): Dump {
  const dump = syntheticDump();
  return { ...dump, [table]: rows(dump[table]) };
}

const countOf = (mapped: Mapped, table: SportbetTable) => {
  const count = mapped.tables.find((each) => each.table === table);
  if (count === undefined) throw new Error(`no count for ${table}`);
  return count;
};

const euroleague = (mapped: Mapped): MappedTournament => {
  const found = mapped.tournaments.find(
    ({ tournament }) => tournament.id === EUROLEAGUE,
  );
  if (found === undefined) throw new Error('no Euroleague tournament mapped');
  return found;
};

/** A second Euroleague tournament (3) with its own round (event 30) and team (30). */
const withSecondTournament = (dump: Dump): Dump => ({
  ...dump,
  tournaments: [
    ...dump.tournaments,
    {
      id: 3,
      name: 'Other EL',
      slug: 'other-el',
      sport: 'basketball',
      standings_format: 'euroleague',
      status: 'active',
      end_date: '2027-05-23',
      is_public: 1,
      survival_game: 1,
    },
  ],
  events: [
    ...dump.events,
    {
      id: 30,
      tournament_id: 3,
      event: '1 turas',
      event_day: 1,
      event_survival: 1,
      is_knockout: 0,
      active: 1,
      rate: 1,
    },
  ],
  teams: [
    ...dump.teams,
    { id: 30, tournament_id: 3, team: 'BAR', group_name: 'A' },
  ],
});

describe('map: reconciliation', () => {
  it('map: every table reconciles: rows read = loaded + skipped + refused', () => {
    for (const count of map().tables) {
      const skipped = Object.values(count.skipped).reduce((a, b) => a + b, 0);
      const refused = Object.values(count.refused).reduce((a, b) => a + b, 0);
      expect({
        table: count.table,
        total: count.loaded + skipped + refused,
      }).toEqual({
        table: count.table,
        total: count.read,
      });
    }
  });
});

describe('map: the golden scenario', () => {
  const mapped = euroleague(map());
  const golden = goldenInputs({}, DUMP_IDS);

  it('map: the golden rows map to the golden inputs, through sportbetColumns and the stored factories', () => {
    expect(mapped.tournament).toMatchObject({
      slug: 'golden-el',
      endsOn: GOLDEN.endsOn,
    });
    expect(mapped.rounds.map(({ round }) => round)).toEqual(
      golden.season.rounds,
    );
    expect(mapped.games.filter(({ id }) => id !== UNSCORED_GAME)).toEqual(
      golden.season.games,
    );
    expect(
      mapped.predictions.filter(({ game }) => game !== UNSCORED_GAME),
    ).toEqual(golden.predictions);
    expect(mapped.standings).toEqual(golden.standings);
    expect(mapped.outcomes.teams).toEqual(golden.outcomes.teams);
    expect(
      golden.survival.from === 'picks' && [...golden.survival.runs],
    ).toEqual([...mapped.runs]);
    expect(mapped.players.map(({ player: id }) => id)).toEqual(golden.players);
  });

  // sportbet's end_date is optional, and a Euroleague season's is not known
  // when it starts (the owner, 2026-09-30).
  it('map: a tournament without an end date maps with none, and every row of it as with one', () => {
    const withoutEndDate = map(
      changed('tournaments', (rows) =>
        rows.map((row) =>
          row['id'] === EUROLEAGUE ? { ...row, end_date: null } : row,
        ),
      ),
    );
    expect(euroleague(withoutEndDate)).toEqual({
      ...mapped,
      tournament: { ...mapped.tournament, endsOn: null },
    });
    expect(withoutEndDate.tables).toEqual(map().tables);
  });

  it("map: the tournament's profile is production's: status, start date, sport, description, public switch", () => {
    expect(mapped.profile).toEqual({
      status: 'active',
      startsOn: null,
      sport: 'basketball',
      description: null,
      isPublic: true,
    });
  });

  it("map: production's points rows are golden-points.json's 25 Euroleague entries", () => {
    expect(
      snapshotOf(
        {
          ...mapped.production,
          odds: mapped.production.odds.filter(
            ({ game }) => game !== UNSCORED_GAME,
          ),
        },
        DUMP_IDS,
      ),
    ).toEqual(GOLDEN_POINTS);
  });

  it("map: production's survival rows keep sportbet's ids as their stored ids", () => {
    expect(mapped.production.survival.map(({ storedId }) => storedId)).toEqual([
      2, 3, 4, 5, 6,
    ]);
  });

  it('map: sportbet does not record a final table, so the outcomes load as not final (R-14), and the report says so', () => {
    expect(mapped.outcomes.tableIsFinal).toBe(false);
    expect(map().notices).toContain(
      'tournaments: sportbet does not record whether its standings table is final (R-14); every tournament is loaded with it not final',
    );
  });
});

// P2: sportbet's medal count lists a team whose active players' finals are
// all 0, with zeros; the new schema stores that 0 as no final place, so the
// hub does not. The reader counts both, numbers only.
describe('map: final 0 in prediction_standings (P2)', () => {
  const notice = (rows: number, teams: number) =>
    `prediction_standings: ${String(rows)} rows hold final 0, loaded as no final place; ${String(teams)} teams have only such finals among active players, which sportbet's medal count lists with zeros and the hub's does not (P2)`;

  // The active players' Euroleague standings rows of one team two of them picked.
  const dump = syntheticDump();
  const activeUsers = new Set(
    dump.user_settings
      .filter((row) => row['active'] === 1)
      .map((row) => row['user_id']),
  );
  const euroleagueRows = dump.prediction_standings.filter(
    (row) => row['id'] !== 1 && activeUsers.has(row['user_id'] ?? null),
  );
  const team = euroleagueRows
    .map((row) => row['team_id'])
    .find(
      (id) => euroleagueRows.filter((row) => row['team_id'] === id).length >= 2,
    );
  const ofTeam = euroleagueRows.filter((row) => row['team_id'] === team);
  const [first] = ofTeam;
  if (team === undefined || first === undefined) {
    throw new Error(
      'the golden scenario has no team two active players picked',
    );
  }

  /** The dump with the final of each row named by id set; every other row as it is. */
  const withFinals = (finals: ReadonlyMap<unknown, number>): Dump =>
    changed('prediction_standings', (rows) =>
      rows.map((row) => {
        const final = finals.get(row['id']);
        return final === undefined ? row : { ...row, final };
      }),
    );

  it('map: the synthetic dump holds no final 0', () => {
    expect(map().notices).toContain(notice(0, 0));
  });

  it('map: a final 0 on a team with another active final 1 to 4 is counted as a row, not a team', () => {
    const finals = new Map(
      ofTeam.map((row) => [row['id'], row === first ? 0 : 1] as const),
    );
    expect(map(withFinals(finals)).notices).toContain(notice(1, 0));
  });

  it('map: a team whose every active final is 0 is counted', () => {
    const finals = new Map(ofTeam.map((row) => [row['id'], 0] as const));
    expect(map(withFinals(finals)).notices).toContain(notice(ofTeam.length, 1));
  });

  it("map: a team whose only final 0 is an inactive player's is not counted", () => {
    const zeroOnly = withFinals(new Map([[first['id'], 0]]));
    const inactive: Dump = {
      ...zeroOnly,
      user_settings: zeroOnly.user_settings.map((row) =>
        row['user_id'] === first['user_id'] ? { ...row, active: 0 } : row,
      ),
    };
    expect(map(inactive).notices).toContain(notice(1, 0));
  });
});

describe('map: skipped by design', () => {
  const mapped = map();

  it('map: a football tournament is skipped with every row that belongs to it, counted per table', () => {
    const notEuroleague = Object.fromEntries(
      mapped.tables.map((count) => [
        count.table,
        count.skipped['not-euroleague'] ?? 0,
      ]),
    );
    expect(notEuroleague).toEqual({
      tournaments: 1,
      events: 1,
      teams: 2,
      games: 1,
      game_odds: 1,
      users: 0,
      user_settings: 0,
      leagues: 1,
      league_members: 2,
      prediction_results: 2,
      prediction_standings: 1,
      prediction_survivals: 2,
      point_results: 1,
      point_standings: 1,
      point_survivals: 1,
    });
  });

  it('map: a user in no loaded tournament is not loaded, and counted without an id', () => {
    expect(mapped.players.map(({ id }) => id)).toEqual(['1', '2', '3', '4']);
    expect(countOf(mapped, 'users')).toMatchObject({
      loaded: 4,
      skipped: { 'in-no-loaded-tournament': 2 },
      refusals: [],
    });
  });

  // A user whose settings cannot be read is refused under a named reason
  // whether or not they play a loaded tournament: no default is guessed,
  // and the owner sees every such account counted (#16 review, B1).
  const refusalsOf = (each: Mapped) =>
    each.tables.flatMap(({ table, refusals }) =>
      refusals.map((refusal) => ({ table, ...refusal })),
    );
  const EVE = 5;
  const FOOTBALL_FAN = 6;

  it('map: a user in no loaded tournament with no user_settings row is refused as player-without-settings, not skipped', () => {
    const withoutSettings = map(
      changed('user_settings', (rows) =>
        rows.filter((row) => row['user_id'] !== EVE),
      ),
    );
    expect(countOf(withoutSettings, 'users')).toMatchObject({
      loaded: 4,
      skipped: { 'in-no-loaded-tournament': 1 },
      refused: { 'player-without-settings': 1 },
      refusals: [{ reason: 'player-without-settings', row: '' }],
    });
    expect(countOf(withoutSettings, 'user_settings')).toMatchObject({
      read: 5,
      loaded: 4,
      skipped: { 'user-not-loaded': 1 },
      refused: {},
    });
    // The one refusal added is the user's own.
    const before = refusalsOf(map());
    expect(refusalsOf(withoutSettings)).toHaveLength(before.length + 1);
    expect(refusalsOf(withoutSettings)).toEqual(
      expect.arrayContaining([
        ...before,
        { table: 'users', reason: 'player-without-settings', row: '' },
      ]),
    );
    expect(withoutSettings.players).toEqual(mapped.players);
    expect(withoutSettings.settings).toEqual(mapped.settings);
  });

  it('map: a user in no loaded tournament with user_settings rows that differ is refused with them as duplicate-key, not skipped', () => {
    const conflicting = map(
      changed('user_settings', (rows) => [
        ...rows,
        {
          id: 90,
          user_id: FOOTBALL_FAN,
          admin: 0,
          receive_reminders: 0,
          active: 0,
          locale: 'lt',
        },
      ]),
    );
    expect(countOf(conflicting, 'users')).toMatchObject({
      loaded: 4,
      skipped: { 'in-no-loaded-tournament': 1 },
      refused: { 'depends-on-refused (duplicate-key)': 1 },
    });
    expect(countOf(conflicting, 'user_settings')).toMatchObject({
      read: 7,
      loaded: 4,
      skipped: { 'user-not-loaded': 1 },
      refused: { 'duplicate-key': 2 },
    });
    // The refusals added are the two settings rows and the user.
    const before = refusalsOf(map());
    expect(refusalsOf(conflicting)).toHaveLength(before.length + 3);
    expect(refusalsOf(conflicting)).toEqual(
      expect.arrayContaining([
        ...before,
        { table: 'user_settings', reason: 'duplicate-key', row: '' },
        {
          table: 'users',
          reason: 'depends-on-refused (duplicate-key)',
          row: '',
        },
      ]),
    );
    expect(conflicting.players).toEqual(mapped.players);
    expect(conflicting.settings).toEqual(mapped.settings);
  });

  it('map: every loaded player has exactly one settings row', () => {
    expect(mapped.settings.map(({ player: id }) => id)).toEqual(
      mapped.players.map(({ id }) => id),
    );
  });

  it("map: sportbet's seeded survival slots, rows with no event, are skipped", () => {
    expect(countOf(mapped, 'prediction_survivals').skipped).toEqual({
      'not-euroleague': 2,
      'seeded-slot-without-event': 7,
    });
  });

  it('map: a player carries the account the reader now reads, and their settings', () => {
    expect(mapped.players[0]).toEqual({
      id: '1',
      username: 'ada',
      email: 'sentinel.ada@example.invalid',
      name: 'Sentinel-Name-ada',
      surname: 'Sentinel-Surname-ada',
    });
    expect(mapped.settings.map(({ player: id }) => id)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(mapped.settings[0]).toEqual({
      player: '1',
      locale: 'lt',
      role: 'player',
      lastTournament: null,
    });
  });
});

describe('map: roles (R-26 amended)', () => {
  it("map: sportbet's admin levels become roles, and a notice counts each role", () => {
    const mapped = map(
      changed('user_settings', (rows) =>
        rows.map((row, index) => ({
          ...row,
          admin: [0, 5, 9][index % 3] ?? 0,
        })),
      ),
    );
    const roles = mapped.settings.map(({ role }) => role);
    expect(new Set(roles)).toEqual(
      new Set(['player', 'results-manager', 'superadmin']),
    );
    const counts = {
      player: roles.filter((role) => role === 'player').length,
      manager: roles.filter((role) => role === 'results-manager').length,
      superadmin: roles.filter((role) => role === 'superadmin').length,
    };
    expect(mapped.notices).toContain(
      `player_settings: ${String(counts.player)} players, ${String(counts.manager)} results managers, ${String(counts.superadmin)} superadmins (R-26 amended)`,
    );
  });
});

describe('map: game odds', () => {
  const mapped = map();

  it('map: of duplicates equal to each other the lowest id is kept, and the report notes it', () => {
    expect(countOf(mapped, 'game_odds')).toMatchObject({
      loaded: 4,
      skipped: { 'not-euroleague': 1, 'duplicate-equal': 1 },
      refusals: [],
    });
    expect(mapped.notices).toContain(
      'game_odds: game 7 has 2 equal rows; the lowest id is kept, as sportbetColumns documents',
    );
    const kept = euroleague(mapped).production.odds.find(
      ({ game }) => game === IDS.game(1),
    );
    expect(kept?.odds.home.toString()).toBe('0.59');
  });

  it("map: duplicates that differ refuse every odds row of their game, since which one sportbet scored with cannot be known; the report says the sportbet recalculation scores it at CO-5's 1.0", () => {
    const differing = map(
      changed('game_odds', (rows) => [
        ...rows,
        {
          id: 12,
          game_id: IDS.game(2),
          home_odds: '1.00',
          draw_odds: '1.00',
          away_odds: '1.00',
        },
      ]),
    );
    expect(countOf(differing, 'game_odds')).toMatchObject({
      loaded: 3,
      skipped: { 'not-euroleague': 1, 'duplicate-equal': 1 },
      refused: { 'duplicate-key': 2 },
      refusals: [
        { reason: 'duplicate-key', row: 'id 8' },
        { reason: 'duplicate-key', row: 'id 12' },
      ],
    });
    expect(
      euroleague(differing).production.odds.map(({ game }) => game),
    ).not.toContain(IDS.game(2));
    expect(differing.notices).toContain(
      "game_odds: game 8 has 2 rows that differ; all are refused, as which one sportbet scored with cannot be known. The game is scored and now has no stored odds: the sportbet recalculation scores it at CO-5's missing odds, 1.0, so its sportbet match points may differ from production's; the ruled recalculation computes its odds from the votes",
    );
  });

  it("map: sportbet's blank odds row reads as odds 0, not CO-5's 1.0", () => {
    const blank = euroleague(mapped).production.odds.find(
      ({ game }) => game === UNSCORED_GAME,
    );
    expect(blank?.odds.home.equals(Odds.ZERO)).toBe(true);
    expect(blank?.odds.draw.equals(Odds.ZERO)).toBe(true);
  });
});

describe('map: a negative score', () => {
  // sportbet f3e08eb accepts -1 : -1 again as its postponed placeholder;
  // the rebuild has a postponed state instead (R-41), and production held
  // none on 2026-09-29. How to load one is the owner's call, so the run
  // stops rather than refuse the game and every row that depends on it.
  const game = String(IDS.game(2));
  it.each([
    [
      "sportbet's postponed placeholder -1 : -1",
      -1,
      -1,
      `map: game ${game} holds sportbet's postponed placeholder -1 : -1 (f3e08eb); R-41 gives a postponed game its own state, so how to load it is the owner's call`,
    ],
    [
      'any other negative score',
      80,
      -3,
      `map: game ${game} has a negative score that is not sportbet's postponed placeholder -1 : -1, which sportbet refuses; how to load it is the owner's call`,
    ],
  ])(
    'map: a game with %s stops the run with its own message, naming the game',
    (_, home, away, message) => {
      const dump = changed('games', (rows) =>
        rows.map((row) =>
          row['id'] === IDS.game(2)
            ? { ...row, home_team_score: home, away_team_score: away }
            : row,
        ),
      );
      expect(() => map(dump)).toThrow(ReaderProblem);
      expect(() => map(dump)).toThrow(message);
    },
  );
});

describe('map: refusals', () => {
  it("map: an orphan prediction and a generated of '2' are refused, naming only the game", () => {
    expect(countOf(map(), 'prediction_results').refusals).toEqual([
      { reason: 'orphan', row: 'game 999' },
      { reason: 'bad-generated', row: 'game 7' },
    ]);
  });

  it('map: a tournament with an impossible end date is refused by id, and every row of it depends on it', () => {
    const mapped = map(
      changed('tournaments', (rows) =>
        rows.map((row) =>
          row['id'] === EUROLEAGUE ? { ...row, end_date: '2027-02-30' } : row,
        ),
      ),
    );
    expect(mapped.tournaments).toEqual([]);
    expect(countOf(mapped, 'tournaments').refusals).toEqual([
      { reason: 'bad-end-date', row: 'id 2' },
    ]);
    const inherited = 'depends-on-refused (bad-end-date)';
    expect(countOf(mapped, 'events').refused).toEqual({ [inherited]: 2 });
    expect(countOf(mapped, 'games').refused).toEqual({ [inherited]: 4 });
    expect(countOf(mapped, 'prediction_results').refused[inherited]).toBe(11);
    expect(countOf(mapped, 'point_survivals').refused).toEqual({
      [inherited]: 5,
    });
  });

  it('map: a tournament whose status sportbet does not have is refused, with every row of it', () => {
    const mapped = map(
      changed('tournaments', (rows) =>
        rows.map((row) =>
          row['id'] === EUROLEAGUE ? { ...row, status: 'paused' } : row,
        ),
      ),
    );
    expect(countOf(mapped, 'tournaments').refused).toEqual({
      'bad-status': 1,
    });
    expect(mapped.tournaments).toEqual([]);
  });

  it('map: an event after round 38 is refused as stage-unknown, and its games with it', () => {
    const mapped = map({
      ...changed('events', (rows) => [
        ...rows,
        {
          id: 6,
          tournament_id: EUROLEAGUE,
          event: 'Play-in',
          event_day: 39,
          event_survival: 0,
          is_knockout: 1,
          active: 1,
          rate: 1,
        },
      ]),
    });
    expect(countOf(mapped, 'events').refusals).toEqual([
      { reason: 'stage-unknown', row: 'id 6' },
    ]);
  });

  it("map: a game whose team is another tournament's is refused as cross-tournament", () => {
    const dump = withSecondTournament(syntheticDump());
    const mapped = map({
      ...dump,
      games: [
        ...dump.games,
        {
          id: 11,
          game_date: '2026-06-22 18:00:00',
          event_id: IDS.event(2),
          home_team_id: IDS.team('ZAL'),
          away_team_id: 30,
          reminder_sent: 0,
        },
      ],
    });
    expect(countOf(mapped, 'games').refusals).toEqual([
      { reason: 'cross-tournament', row: 'id 11' },
    ]);
  });

  it("map: a survival pick of another tournament's team is refused as cross-tournament", () => {
    const dump = withSecondTournament(syntheticDump());
    const mapped = map({
      ...dump,
      prediction_survivals: [
        ...dump.prediction_survivals,
        {
          id: 90,
          user_id: IDS.player('cai'),
          team_id: 30,
          event_id: IDS.event(1),
        },
      ],
    });
    expect(countOf(mapped, 'prediction_survivals').refusals).toEqual([
      { reason: 'cross-tournament', row: 'event 4' },
    ]);
  });

  // The owner, 2026-10-01: which of two copies sportbet used cannot be
  // known (its crowd odds count both, its points follow MySQL's fetch
  // order), so every copy is refused, a player's standings rows too.
  // sportbet's unique indexes keep point_results and point_standings from
  // holding any.
  it.each([
    [
      'prediction_results',
      (row: DumpRow) =>
        row['user_id'] === IDS.player('ada') && row['game_id'] === IDS.game(1),
      'game 7',
    ],
    ['point_results', (row: DumpRow) => row['id'] === 2, 'game 7'],
    ['prediction_standings', (row: DumpRow) => row['id'] === 2, 'team 5'],
    ['point_standings', (row: DumpRow) => row['id'] === 2, 'team 5'],
  ] as const)(
    'map: two copies of one %s row are both refused as duplicate-key, and the report notes it',
    (table, pick, where) => {
      const original = syntheticDump()[table].find(pick);
      if (original === undefined) throw new Error('fixture: no row to copy');
      const copied = map(
        changed(table, (rows) => [...rows, { ...original, id: 90 }]),
      );
      expect(countOf(copied, table).refused['duplicate-key']).toBe(2);
      expect(
        countOf(copied, table).refusals.filter(
          ({ reason }) => reason === 'duplicate-key',
        ),
      ).toEqual([
        { reason: 'duplicate-key', row: where },
        { reason: 'duplicate-key', row: where },
      ]);
      expect(countOf(copied, table).loaded).toBe(
        countOf(map(), table).loaded - 1,
      );
      expect(copied.notices).toContain(
        `${table}: ${where} has 2 rows of one player; all are refused, as which one sportbet used cannot be known`,
      );
    },
  );

  it('map: a second survival pick in one round is refused as two-picks-in-one-round', () => {
    const mapped = map(
      changed('prediction_survivals', (rows) => [
        ...rows,
        {
          id: 90,
          user_id: IDS.player('ada'),
          team_id: IDS.team('OLY'),
          event_id: IDS.event(1),
        },
      ]),
    );
    expect(countOf(mapped, 'prediction_survivals').refusals).toEqual([
      { reason: 'two-picks-in-one-round', row: 'event 4' },
    ]);
  });

  it('map: two user_settings rows that differ refuse the player, and every row they own depends on it', () => {
    const mapped = map(
      changed('user_settings', (rows) => [
        ...rows,
        {
          id: 90,
          user_id: IDS.player('ben'),
          admin: 0,
          receive_reminders: 0,
          active: 0,
          locale: 'lt',
        },
      ]),
    );
    expect(countOf(mapped, 'user_settings').refused).toEqual({
      'duplicate-key': 2,
    });
    expect(countOf(mapped, 'users').refused).toEqual({
      'depends-on-refused (duplicate-key)': 1,
    });
    expect(countOf(mapped, 'prediction_results').refused).toMatchObject({
      // ben's three Euroleague predictions; his fourth is an orphan.
      'depends-on-refused (duplicate-key)': 3,
    });
    expect(mapped.players.map(({ id }) => id)).toEqual(['1', '3', '4']);
  });

  it('map: a user with no user_settings row is refused as player-without-settings, not guessed active, and every row they own depends on it', () => {
    const mapped = map(
      changed('user_settings', (rows) =>
        rows.filter((row) => row['user_id'] !== IDS.player('cai')),
      ),
    );
    expect(countOf(mapped, 'users')).toMatchObject({
      loaded: 3,
      refused: { 'player-without-settings': 1 },
      refusals: [{ reason: 'player-without-settings', row: '' }],
    });
    expect(countOf(mapped, 'user_settings')).toMatchObject({
      read: 5,
      loaded: 3,
      skipped: { 'user-not-loaded': 2 },
      refused: {},
    });
    expect(countOf(mapped, 'prediction_results').refused).toMatchObject({
      'depends-on-refused (player-without-settings)': 3,
    });
    expect(mapped.players.map(({ id }) => id)).toEqual(['1', '2', '4']);
    expect(euroleague(mapped).players.map(({ player: id }) => id)).toEqual([
      '1',
      '2',
      '4',
    ]);
  });

  it('map: a blank username is refused without naming it, and the rows its player owns with it', () => {
    const mapped = map(
      changed('users', (rows) =>
        rows.map((row) =>
          row['id'] === IDS.player('cai') ? { ...row, username: '  ' } : row,
        ),
      ),
    );
    expect(countOf(mapped, 'users').refusals).toEqual([
      { reason: 'bad-username', row: '' },
    ]);
    expect(countOf(mapped, 'prediction_results').refused).toMatchObject({
      'depends-on-refused (bad-username)': 3,
    });
  });

  it('map: an address sportbet did not store normalized is refused as unnormalized-email without naming it, never fixed, and the rows its player owns with it', () => {
    const mapped = map(
      changed('users', (rows) =>
        rows.map((row) =>
          row['id'] === IDS.player('cai')
            ? { ...row, email: 'Sentinel.Cai@example.invalid' }
            : row,
        ),
      ),
    );
    expect(countOf(mapped, 'users').refusals).toEqual([
      { reason: 'unnormalized-email', row: '' },
    ]);
    expect(countOf(mapped, 'prediction_results').refused).toMatchObject({
      'depends-on-refused (unnormalized-email)': 3,
    });
    expect(mapped.players.map(({ id }) => id)).toEqual(['1', '2', '4']);
  });

  it('map: two users whose addresses are equal once accents are dropped are both refused, neither chosen', () => {
    const mapped = map(
      changed('users', (rows) =>
        rows.map((row) =>
          row['id'] === IDS.player('ben')
            ? { ...row, email: 'sentinėl.ada@example.invalid' }
            : row,
        ),
      ),
    );
    expect(countOf(mapped, 'users').refused).toEqual({ 'email-collision': 2 });
    expect(countOf(mapped, 'users').refusals).toEqual([
      { reason: 'email-collision', row: '' },
      { reason: 'email-collision', row: '' },
    ]);
    expect(mapped.players.map(({ id }) => id)).toEqual(['3', '4']);
  });

  it('map: a user_settings row with a negative admin level refuses the player, and every row they own depends on it', () => {
    const mapped = map(
      changed('user_settings', (rows) =>
        rows.map((row) =>
          row['user_id'] === IDS.player('cai') ? { ...row, admin: -1 } : row,
        ),
      ),
    );
    expect(countOf(mapped, 'user_settings').refused).toEqual({
      'bad-admin-level': 1,
    });
    expect(countOf(mapped, 'users').refused).toEqual({
      'depends-on-refused (bad-admin-level)': 1,
    });
    expect(mapped.players.map(({ id }) => id)).toEqual(['1', '2', '4']);
  });

  it("map: football's columns set in a Euroleague row are refused as football-column-set", () => {
    const dump = syntheticDump();
    const mapped = map({
      ...dump,
      teams: dump.teams.map((row) =>
        row['id'] === IDS.team('REA') ? { ...row, last16: 1 } : row,
      ),
      prediction_results: dump.prediction_results.map((row) =>
        row['id'] === 3 ? { ...row, game_winner_id: IDS.team('ZAL') } : row,
      ),
      point_standings: dump.point_standings.map((row) =>
        row['id'] === 2 ? { ...row, last32_points: '0' } : row,
      ),
    });
    expect(countOf(mapped, 'teams').refused).toEqual({
      'football-column-set': 1,
    });
    expect(countOf(mapped, 'prediction_results').refused).toMatchObject({
      'football-column-set': 1,
    });
    expect(countOf(mapped, 'point_standings').refused).toMatchObject({
      'football-column-set': 1,
    });
  });

  it('map: a standings point with more places than sportbet stores is refused, never rounded', () => {
    const mapped = map(
      changed('point_standings', (rows) =>
        rows.map((row) =>
          row['id'] === 2
            ? { ...row, group_position_points: '380.00001' }
            : row,
        ),
      ),
    );
    expect(countOf(mapped, 'point_standings').refusals).toEqual([
      { reason: 'bad-standings-points', row: 'team 5' },
    ]);
  });
});

describe('map: tournament players', () => {
  it("map: a switched-off player is switched off in the tournament, and the tournament's own fill-ins are counted", () => {
    const mapped = map(
      changed('prediction_results', (rows) =>
        rows.map((row) => (row['id'] === 3 ? { ...row, generated: '1' } : row)),
      ),
    );
    expect(euroleague(mapped).players).toEqual([
      { player: '1', switchedOff: false, adminHidden: false, fillIns: 1 },
      { player: '2', switchedOff: false, adminHidden: false, fillIns: 0 },
      { player: '3', switchedOff: false, adminHidden: false, fillIns: 0 },
      { player: '4', switchedOff: true, adminHidden: false, fillIns: 0 },
    ]);
  });
});

describe('map: what the parity checker needs', () => {
  it("map: each tournament's leagues with their loaded members, for sportbet's rankings", () => {
    expect(euroleague(map()).leagues).toEqual([
      { id: 2, members: ['1', '2', '3', '4'] },
    ]);
  });

  it("map: a row refused while its game and player loaded is a key parity cannot compare; an orphan's is none", () => {
    // dan's generated '2' (prediction 14) is refused; sportbet scores it.
    expect(euroleague(map()).refusedPoints).toEqual({
      matches: [{ player: '4', game: IDS.game(1) }],
      standings: [],
      survival: [],
      odds: [],
    });
  });

  it('map: a game whose odds rows differ is a game parity cannot compare', () => {
    const differing = map(
      changed('game_odds', (rows) => [
        ...rows,
        {
          id: 12,
          game_id: IDS.game(2),
          home_odds: '1.00',
          draw_odds: '1.00',
          away_odds: '1.00',
        },
      ]),
    );
    expect(euroleague(differing).refusedPoints.odds).toEqual([IDS.game(2)]);
  });

  it('map: a refused standings points row is a key parity cannot compare', () => {
    const mapped = map(
      changed('point_standings', (rows) =>
        rows.map((row) =>
          row['id'] === 2
            ? { ...row, group_position_points: '380.00001' }
            : row,
        ),
      ),
    );
    expect(euroleague(mapped).refusedPoints.standings).toEqual([
      { player: '1', team: '5' },
    ]);
  });

  it("map: a refused survival row is a key parity cannot compare, by sportbet's id", () => {
    const dump = withSecondTournament(syntheticDump());
    const mapped = map({
      ...dump,
      point_survivals: [
        ...dump.point_survivals,
        {
          id: 50,
          user_id: IDS.player('ada'),
          event_id: IDS.event(1),
          team_id: 30,
          survival_points: 10,
        },
      ],
    });
    expect(euroleague(mapped).refusedPoints.survival).toEqual([50]);
  });
});

describe('map: what the parity checker cannot compare, row by row', () => {
  const DAN_GENERATED = { player: '4', game: IDS.game(1) };
  const copiedRefused = (table: DumpTable, id: number) => {
    const original = syntheticDump()[table].find((row) => row['id'] === id);
    if (original === undefined) throw new Error('fixture: no row to copy');
    const copied = map(
      changed(table, (rows) => [...rows, { ...original, id: 90 }]),
    );
    return { original, refused: euroleague(copied).refusedPoints };
  };

  // Every copy is refused, so their one key is one row parity cannot compare.
  it.each(['prediction_results', 'point_results'] as const)(
    'map: two copies of one %s row are one match key parity cannot compare',
    (table) => {
      const { original, refused } = copiedRefused(
        table,
        table === 'prediction_results' ? 3 : 2,
      );
      expect(refused.matches).toEqual(
        expect.arrayContaining([
          DAN_GENERATED,
          {
            player: String(original['user_id']),
            game: original['game_id'],
          },
        ]),
      );
      expect(refused.matches).toHaveLength(2);
    },
  );

  it.each(['prediction_standings', 'point_standings'] as const)(
    'map: two copies of one %s row are one standings key parity cannot compare',
    (table) => {
      const { original, refused } = copiedRefused(table, 2);
      expect(refused.standings).toEqual([
        {
          player: String(original['user_id']),
          team: String(original['team_id']),
        },
      ]);
    },
  );

  it("map: a refused player's rows are no key parity cannot compare, and the player is no league member", () => {
    const mapped = map(
      changed('user_settings', (rows) =>
        rows.filter((row) => row['user_id'] !== IDS.player('cai')),
      ),
    );
    expect(euroleague(mapped).refusedPoints).toEqual(
      euroleague(map()).refusedPoints,
    );
    expect(euroleague(mapped).leagues).toEqual([
      { id: 2, members: ['1', '2', '4'] },
    ]);
  });
});
