// Slice 15, R-93, R-94: previewEuroleagueImport plans from the tournament's
// rows and the feed's fixtures, fingerprints the plan and writes nothing.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { previewEuroleagueImport } from '../src/import/preview';
import { saveTeams } from '../src/team/repository';
import { useTestDatabase } from '../src/testing';
import {
  BEFORE_SEASON,
  fixtureSeason,
  saveEmptyTournament,
} from './import-support';
import { OTHER, TEAMS, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const TABLES = [
  'teams',
  'team_outcomes',
  'rounds',
  'games',
  'match_predictions',
  'standings_predictions',
  'tournament_players',
] as const;

/** Every table the import could write, with its row count. */
async function counts(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of TABLES) {
    const { rows } = await client.query(
      `select count(*)::int as n from ${table}`,
    );
    result[table] = z.array(z.object({ n: z.int() })).parse(rows)[0]?.n ?? -1;
  }
  return result;
}

async function preview(tournament = TOURNAMENT) {
  const season = await fixtureSeason();
  return previewEuroleagueImport(db, {
    tournament,
    fixtures: season.fixtures,
    postSeasonLeftOut: season.postSeasonLeftOut,
    now: BEFORE_SEASON,
  });
}

describe('previewEuroleagueImport', () => {
  it('plans the fixture into an empty tournament and fingerprints the plan', async () => {
    await saveEmptyTournament(db);
    const result = await preview();
    if (!result.ok) throw new Error(`refused: ${result.refusal.kind}`);
    const { plan, fingerprint } = result.value;
    expect(plan.teamsToCreate).toHaveLength(20);
    expect(plan.roundsToCreate.map((each) => each.name)).toEqual([
      '1 turas',
      '2 turas',
    ]);
    expect(plan.gamesToCreate).toHaveLength(20);
    expect(plan.playersAffected).toBe(3);
    expect(plan.teamsWithoutCrest).toEqual([]);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the same fingerprint twice', async () => {
    await saveEmptyTournament(db);
    const first = await preview();
    const second = await preview();
    const sportbet = await preview();
    if (!first.ok || !second.ok || !sportbet.ok) throw new Error('refused');
    expect(second.value.fingerprint).toBe(first.value.fingerprint);
    expect(sportbet.value.fingerprint).toBe(first.value.fingerprint);
  });

  it('follows the tournament survival switch in the rounds it plans (R-129)', async () => {
    await saveEmptyTournament(db, { ...TOURNAMENT, survival: false });
    const result = await preview({
      ...TOURNAMENT,
      survival: false,
    });
    if (!result.ok) throw new Error('refused');
    expect(
      result.value.plan.roundsToCreate.map((each) => each.round.survival),
    ).toEqual([false, false]);
  });

  it('writes nothing', async () => {
    await saveEmptyTournament(db);
    const before = await counts();
    await preview();
    expect(await counts()).toEqual(before);
    expect(before['teams']).toBe(0);
  });

  it("ignores another tournament's teams", async () => {
    await saveEmptyTournament(db);
    await saveEmptyTournament(db, OTHER);
    await saveTeams(db, OTHER, TEAMS);
    const result = await preview();
    if (!result.ok) throw new Error(`refused: ${result.refusal.kind}`);
    expect(result.value.plan.teamsToCreate).toHaveLength(20);
  });

  it('refuses a tournament that is not there', async () => {
    const result = await preview();
    expect(result).toEqual({ ok: false, refusal: { kind: 'no-tournament' } });
  });

  it('refuses a finished tournament (R-110)', async () => {
    const finished = { ...TOURNAMENT, endsOn: '2026-09-01' };
    await saveEmptyTournament(db, finished);
    expect(await preview(finished)).toEqual({
      ok: false,
      refusal: { kind: 'tournament-finished' },
    });
  });

  it("names the clubs a tournament with teams lacks, from this tournament's rows", async () => {
    await saveEmptyTournament(db);
    await saveTeams(db, TOURNAMENT, TEAMS);
    const result = await preview();
    expect(!result.ok && result.refusal.kind).toBe('unmatched-teams');
  });
});
