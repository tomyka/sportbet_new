import {
  countPointsRows,
  findTournamentBySlug,
  loadTournamentInputs,
  loadTournamentPoints,
  loadTournamentCatalogue,
  type Db,
} from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { inputReadsOf, sportbetRules } from '@sportbet/domain';
import { GOLDEN_POINTS, snapshotOf } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  loadMapped,
  recalculateLoaded,
  recalculateLoadedTimed,
} from '../src/load';
import { mapSportbet } from '../src/map';
import {
  DUMP_IDS,
  EUROLEAGUE,
  IDS,
  readRows,
  syntheticDump,
  UNSCORED_GAME,
} from './fixtures/sportbet-dump';

const { db, client } = useTestDatabase();

const mapped = () => mapSportbet(readRows(syntheticDump()));

/** Every table's row count, and the golden tournament's rows as the domain reads them. */
async function everything(database: Db) {
  const tables = z
    .array(z.object({ name: z.string() }))
    .parse(
      (
        await client.query(
          "select tablename as name from pg_tables where schemaname = 'public' order by tablename",
        )
      ).rows,
    );
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const [row] = z
      .array(z.object({ rows: z.coerce.number() }))
      .parse(
        (await client.query(`select count(*) as rows from "${name}"`)).rows,
      );
    counts[name] = row?.rows ?? 0;
  }
  const tournament = await findTournamentBySlug(database, 'golden-el');
  if (tournament === undefined) throw new Error('golden-el was not loaded');
  return {
    counts,
    inputs: await loadTournamentInputs(
      database,
      tournament,
      inputReadsOf(sportbetRules),
      'production',
    ),
    production: await loadTournamentPoints(database, tournament, 'production'),
  };
}

describe('the load', () => {
  it('leaves the same rows when the same mapped rows are loaded twice', async () => {
    await loadMapped(db, mapped());
    const once = await everything(db);
    await loadMapped(db, mapped());
    expect(await everything(db)).toEqual(once);
    expect(once.counts).toMatchObject({
      tournaments: 1,
      players: 4,
      player_settings: 4,
      games: 4,
      match_predictions: 10,
      survival_picks: 5,
    });
  });

  it('leaves one set of rows per source when the tournament is recalculated twice', async () => {
    await loadMapped(db, mapped());
    const tournament = await findTournamentBySlug(db, 'golden-el');
    if (tournament === undefined) throw new Error('golden-el was not loaded');
    await recalculateLoaded(db, [tournament]);
    const once = await countPointsRows(db, tournament);
    await recalculateLoaded(db, [tournament]);
    expect(await countPointsRows(db, tournament)).toEqual(once);
    expect(once).toEqual({
      game_odds: { production: 4, sportbet: 3, ruled: 3 },
      match_points: { production: 9, sportbet: 9, ruled: 9 },
      standings_points: { production: 8, sportbet: 8, ruled: 8 },
      survival_points: { production: 5, sportbet: 5, ruled: 5 },
    });
  });

  it("reports each recalculation's time: a slug, a rule set and milliseconds, nothing else", async () => {
    await loadMapped(db, mapped());
    const tournament = await findTournamentBySlug(db, 'golden-el');
    if (tournament === undefined) throw new Error('golden-el was not loaded');
    // Each call is timed before and after: 7.4 ms apart, rounded.
    let tick = 0;
    const timed = await recalculateLoadedTimed(
      db,
      [tournament],
      () => (tick += 7.4),
    );
    expect(timed.recalculations).toEqual([
      { tournament: tournament.id, rules: 'sportbet', refusal: null },
      { tournament: tournament.id, rules: 'ruled', refusal: null },
    ]);
    expect(timed.notices).toEqual([
      'recalculation: golden-el under sportbet took 7 ms',
      'recalculation: golden-el under ruled took 7 ms',
    ]);
  });

  it("loads each tournament's profile", async () => {
    await loadMapped(db, mapSportbet(readRows(syntheticDump())));
    const tournament = await findTournamentBySlug(db, 'golden-el');
    if (tournament === undefined) throw new Error('golden-el was not loaded');
    const loaded = await loadTournamentCatalogue(db);
    expect(
      loaded.find((each) => each.tournament.id === tournament.id)?.profile,
    ).toEqual({
      status: 'active',
      startsOn: null,
      sport: 'basketball',
      description: null,
      isPublic: true,
    });
  });

  // sportbet's end_date is optional, and a Euroleague season's is not known
  // when it starts (the owner, 2026-09-30).
  it('loads a tournament without an end date and recalculates it as with one', async () => {
    const recalculated = async (dump: ReturnType<typeof syntheticDump>) => {
      await loadMapped(db, mapSportbet(readRows(dump)));
      const tournament = await findTournamentBySlug(db, 'golden-el');
      if (tournament === undefined) throw new Error('golden-el was not loaded');
      return {
        tournament,
        runs: await recalculateLoaded(db, [tournament]),
        sportbet: await loadTournamentPoints(db, tournament, 'sportbet'),
        ruled: await loadTournamentPoints(db, tournament, 'ruled'),
      };
    };
    const withEndDate = await recalculated(syntheticDump());
    const dump = syntheticDump();
    const withoutEndDate = await recalculated({
      ...dump,
      tournaments: dump.tournaments.map((row) =>
        row['id'] === EUROLEAGUE ? { ...row, end_date: null } : row,
      ),
    });
    expect(withoutEndDate.tournament).toEqual({
      ...withEndDate.tournament,
      endsOn: null,
    });
    expect(withoutEndDate.runs).toEqual([
      { tournament: EUROLEAGUE, rules: 'sportbet', refusal: null },
      { tournament: EUROLEAGUE, rules: 'ruled', refusal: null },
    ]);
    expect([withoutEndDate.sportbet, withoutEndDate.ruled]).toEqual([
      withEndDate.sportbet,
      withEndDate.ruled,
    ]);
  });

  // Both copies of ben's ZAL prediction are refused (duplicate-key), so ben
  // is one team short. sportbet stores a standings row only for a
  // prediction that exists (PointStandingController.php:163-177), and a
  // team's crowd denominators count only its predictions
  // (StandingPointsRow.php:76-77, 97, 112): ada's exact ZAL place is then
  // one of one, log2(1/1) = 0 (CrowdOdds.php:18-21), so it pays its base
  // 190 at odds 0 (StandingPointsRow.php:78-81) instead of golden's 380
  // at 1. Refused copies must score exactly as no row at all.
  it('recalculates a player whose duplicated standings prediction is refused as sportbet scores one team short', async () => {
    const benZal = (row: Record<string, unknown>) =>
      row['user_id'] === IDS.player('ben') &&
      row['team_id'] === IDS.team('ZAL');
    const recalculated = async (dump: ReturnType<typeof syntheticDump>) => {
      await loadMapped(db, mapSportbet(readRows(dump)));
      const tournament = await findTournamentBySlug(db, 'golden-el');
      if (tournament === undefined) throw new Error('golden-el was not loaded');
      const standingsOf = async (source: 'sportbet' | 'ruled') => {
        const rows = await loadTournamentPoints(db, tournament, source);
        return snapshotOf(
          {
            ...rows,
            odds: rows.odds.filter(({ game }) => game !== UNSCORED_GAME),
          },
          DUMP_IDS,
        ).point_standings;
      };
      return {
        runs: await recalculateLoaded(db, [tournament]),
        sportbet: await standingsOf('sportbet'),
        ruled: await standingsOf('ruled'),
      };
    };
    const dump = syntheticDump();
    const original = dump.prediction_standings.find(benZal);
    if (original === undefined) throw new Error('fixture: ben has no ZAL row');
    const copied = await recalculated({
      ...dump,
      prediction_standings: [
        ...dump.prediction_standings,
        { ...original, id: 90 },
      ],
    });
    const absent = await recalculated({
      ...dump,
      prediction_standings: dump.prediction_standings.filter(
        (row) => !benZal(row),
      ),
    });

    expect(copied.runs).toEqual([
      { tournament: EUROLEAGUE, rules: 'sportbet', refusal: null },
      { tournament: EUROLEAGUE, rules: 'ruled', refusal: null },
    ]);
    const others = Object.fromEntries(
      Object.entries(GOLDEN_POINTS.point_standings).filter(
        ([key]) => key !== 'ben / ZAL',
      ),
    );
    expect(copied.sportbet).toEqual({
      ...others,
      'ada / ZAL': {
        ...GOLDEN_POINTS.point_standings['ada / ZAL'],
        group_position_points: '190.0000',
        group_position_odds: '0.0000',
      },
    });
    expect(Object.keys(copied.ruled).toSorted()).toEqual(
      Object.keys(others).toSorted(),
    );
    expect(copied).toEqual(absent);
  });

  it("scores a game whose odds were refused at CO-5's 1.0 under sportbetRules, as the report says, and from the votes under ruledRules", async () => {
    const dump = syntheticDump();
    await loadMapped(
      db,
      mapSportbet(
        readRows({
          ...dump,
          game_odds: [
            ...dump.game_odds,
            {
              id: 12,
              game_id: IDS.game(2),
              home_odds: '1.00',
              draw_odds: '1.00',
              away_odds: '2.00',
            },
          ],
        }),
      ),
    );
    const tournament = await findTournamentBySlug(db, 'golden-el');
    if (tournament === undefined) throw new Error('golden-el was not loaded');
    expect(await recalculateLoaded(db, [tournament])).toEqual([
      { tournament: tournament.id, rules: 'sportbet', refusal: null },
      { tournament: tournament.id, rules: 'ruled', refusal: null },
    ]);
    const sportbet = await loadTournamentPoints(db, tournament, 'sportbet');
    const ruled = await loadTournamentPoints(db, tournament, 'ruled');
    const hasOdds = (rows: typeof sportbet) =>
      rows.odds.some(({ game }) => game === IDS.game(2));
    expect([hasOdds(sportbet), hasOdds(ruled)]).toEqual([false, true]);
    expect(
      new Set(
        sportbet.matches
          .filter(({ game }) => game === IDS.game(2))
          .map(({ points }) => points.odds.toString()),
      ),
    ).toEqual(new Set(['1.00']));
  });
});
