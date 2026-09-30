import { Odds } from '@sportbet/domain';
import {
  GOLDEN,
  GOLDEN_POINTS,
  goldenInputs,
  snapshotOf,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { mapSportbet, type Mapped, type MappedTournament } from '../src/map';
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

  // What a user's settings say matters only for a player: a user in no
  // loaded tournament is skipped whatever their user_settings rows hold.
  const refusalsOf = (each: Mapped) =>
    each.tables.flatMap(({ table, refusals }) =>
      refusals.map((refusal) => ({ table, ...refusal })),
    );
  const EVE = 5;
  const FOOTBALL_FAN = 6;

  it('map: a user in no loaded tournament with no user_settings row is skipped, adding no refusal', () => {
    const withoutSettings = map(
      changed('user_settings', (rows) =>
        rows.filter((row) => row['user_id'] !== EVE),
      ),
    );
    expect(countOf(withoutSettings, 'users')).toMatchObject({
      loaded: 4,
      skipped: { 'in-no-loaded-tournament': 2 },
      refused: {},
    });
    expect(countOf(withoutSettings, 'user_settings')).toMatchObject({
      read: 5,
      loaded: 4,
      skipped: { 'user-not-loaded': 1 },
      refused: {},
    });
    expect(refusalsOf(withoutSettings)).toEqual(refusalsOf(map()));
    expect(withoutSettings.players).toEqual(mapped.players);
  });

  it('map: a user in no loaded tournament with user_settings rows that differ is skipped with them, adding no refusal', () => {
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
      skipped: { 'in-no-loaded-tournament': 2 },
      refused: {},
    });
    expect(countOf(conflicting, 'user_settings')).toMatchObject({
      read: 7,
      loaded: 4,
      skipped: { 'user-not-loaded': 3 },
      refused: {},
    });
    expect(refusalsOf(conflicting)).toEqual(refusalsOf(map()));
    expect(conflicting.players).toEqual(mapped.players);
  });

  it("map: sportbet's seeded survival slots, rows with no event, are skipped", () => {
    expect(countOf(mapped, 'prediction_survivals').skipped).toEqual({
      'not-euroleague': 2,
      'seeded-slot-without-event': 7,
    });
  });

  it('map: a player keeps only the id and the username', () => {
    expect(mapped.players[0]).toEqual({ id: '1', username: 'ada' });
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
  // order), so every copy is refused. sportbet's unique indexes keep
  // point_results and point_standings from holding any.
  it.each([
    [
      'prediction_results',
      (row: DumpRow) =>
        row['user_id'] === IDS.player('ada') && row['game_id'] === IDS.game(1),
      'game 7',
    ],
    ['point_results', (row: DumpRow) => row['id'] === 2, 'game 7'],
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
