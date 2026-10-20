// Slice 13, R-16, R-37, R-92, R-110: placeholder teams, a rename, and the
// standings facts - recalculated at once, the final mark guarded.

import {
  teamRenameEntry,
  type Role,
  type StandingsFactsEntry,
  type TeamOutcome,
} from '@sportbet/domain';
import { at, team, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createTournament,
  insertPlaceholderTeams,
  loadTournamentTotals,
  recalculateInOwnTransaction,
  renameTeam,
  saveStandingsFacts,
} from '../src';
import { RECALCULATION_LOCK_NAMESPACE } from '../src/recalculation/lock';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  G7,
  OTHER,
  rowsOf,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await saveGames(db, TOURNAMENT, [G7]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  // ADA predicted the table 1-4 in the teams' id order, and Zalgiris and
  // Olympiacos for the play-offs; BEN's rows are blank.
  await client.query(
    'insert into standings_predictions (player_id, team_id, place, play_offs) values (1, 11, 1, true), (1, 12, 2, true), (1, 13, 3, false), (1, 14, 4, false), (2, 11, null, null), (2, 12, null, null), (2, 13, null, null), (2, 14, null, null)',
  );
  await recalculateInOwnTransaction(db, TOURNAMENT);
});

const outcome = (
  club: string,
  columns: Partial<Omit<TeamOutcome, 'team'>> = {},
): TeamOutcome => ({
  team: team(club),
  place: null,
  playOffs: false,
  finalFour: false,
  finalPlace: null,
  ...columns,
});

/** The four teams' places 1-4 in id order, Zalgiris and Olympiacos ticked for the play-offs. */
const TABLE: readonly TeamOutcome[] = [
  outcome('11', { place: 1, playOffs: true }),
  outcome('12', { place: 2, playOffs: true }),
  outcome('13', { place: 3 }),
  outcome('14', { place: 4 }),
];

const facts = (
  rows: readonly TeamOutcome[],
  final: boolean,
  options: { role?: Role } = {},
  tournament = TOURNAMENT,
) =>
  saveStandingsFacts(db, {
    tournament,
    entry: { rows, final } satisfies StandingsFactsEntry,
    role: options.role ?? 'results-manager',
    now: NOW,
  });

const standingsTotal = async () =>
  (await loadTournamentTotals(db, TOURNAMENT, [ADA])).totals.find(
    (total) => total.player === ADA,
  )?.standings;

const finalMarked = async () =>
  z
    .array(z.object({ standings_table_final: z.boolean() }))
    .parse(
      (
        await client.query(
          'select standings_table_final from tournaments where id = 3',
        )
      ).rows,
    )[0]?.standings_table_final;

const outcomeRows = async () =>
  rowsOf(
    await client.query(
      'select team_id, place, play_offs, final_four, final_place from team_outcomes order by team_id',
    ),
  );

describe('saveStandingsFacts (updateTeams, R-16, R-37, R-92)', () => {
  it('standings facts: a tick changes every player`s stored standings points at once', async () => {
    const before = await standingsTotal();
    expect(before?.tenThousandths).toBe(0);
    expect(
      unwrap(await facts([outcome('11', { playOffs: true })], false))
        .boardChanged,
    ).toBe(true);
    const after = await standingsTotal();
    expect((after?.tenThousandths ?? 0) > 0).toBe(true);
    expect(await outcomeRows()).toContainEqual({
      team_id: 11,
      place: null,
      play_offs: true,
      final_four: false,
      final_place: null,
    });
  });

  it('standings facts: a posted row replaces its team`s, the others keep theirs, and every team has a row after', async () => {
    unwrap(await facts([outcome('11', { playOffs: true })], false));
    unwrap(await facts([outcome('12', { place: 2 })], false));
    expect(await outcomeRows()).toEqual([
      {
        team_id: 11,
        place: null,
        play_offs: true,
        final_four: false,
        final_place: null,
      },
      {
        team_id: 12,
        place: 2,
        play_offs: false,
        final_four: false,
        final_place: null,
      },
      {
        team_id: 13,
        place: null,
        play_offs: false,
        final_four: false,
        final_place: null,
      },
      {
        team_id: 14,
        place: null,
        play_offs: false,
        final_four: false,
        final_place: null,
      },
    ]);
  });

  it('standings facts (R-43): places are scored only once the table is marked final', async () => {
    unwrap(await facts(TABLE, false));
    const ticksOnly = await standingsTotal();
    expect(await finalMarked()).toBe(false);
    unwrap(await facts(TABLE, true));
    const marked = await standingsTotal();
    expect(await finalMarked()).toBe(true);
    expect(marked !== undefined && ticksOnly !== undefined).toBe(true);
    expect(
      marked && ticksOnly && marked.tenThousandths > ticksOnly.tenThousandths,
    ).toBe(true);
  });

  it('standings facts (R-92): final needs every place from 1 to N - an incomplete table is refused, nothing written', async () => {
    const before = await standingsTotal();
    expect(
      await facts(
        [outcome('11', { place: 1 }), outcome('12', { place: 2 })],
        true,
      ),
    ).toEqual({ ok: false, refusal: 'places-incomplete' });
    expect(await finalMarked()).toBe(false);
    expect(await outcomeRows()).toEqual([]);
    expect((await standingsTotal())?.tenThousandths).toBe(
      before?.tenThousandths,
    );
  });

  it('standings facts (R-92, R-37): only a superadmin takes the mark off, and the places are unscored again', async () => {
    unwrap(await facts(TABLE, false));
    const ticksOnly = await standingsTotal();
    unwrap(await facts(TABLE, true));
    expect(await facts(TABLE, false, { role: 'results-manager' })).toEqual({
      ok: false,
      refusal: 'unmark-not-allowed',
    });
    expect(await finalMarked()).toBe(true);
    unwrap(await facts(TABLE, false, { role: 'superadmin' }));
    expect(await finalMarked()).toBe(false);
    expect((await standingsTotal())?.tenThousandths).toBe(
      ticksOnly?.tenThousandths,
    );
  });

  it('standings facts: a results manager may correct a final table that stays final', async () => {
    unwrap(await facts(TABLE, true));
    const swapped = [
      outcome('11', { place: 2, playOffs: true }),
      outcome('12', { place: 1, playOffs: true }),
      outcome('13', { place: 3 }),
      outcome('14', { place: 4 }),
    ];
    unwrap(await facts(swapped, true));
    expect(await finalMarked()).toBe(true);
  });

  it('standings facts: a team of another tournament is refused, nothing written', async () => {
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (31, 4, 'Other')",
    );
    expect(await facts([outcome('31', { place: 1 })], false)).toEqual({
      ok: false,
      refusal: 'unknown-team',
    });
    expect(await outcomeRows()).toEqual([]);
  });

  it('standings facts: two teams on one place are refused', async () => {
    expect(
      await facts(
        [outcome('11', { place: 1 }), outcome('12', { place: 1 })],
        false,
      ),
    ).toEqual({ ok: false, refusal: 'duplicate-place' });
  });

  it('standings facts: a finished tournament refuses them (R-110), nothing written', async () => {
    await client.query(
      "update tournaments set ends_on = '2026-10-10' where id = 3",
    );
    expect(await facts(TABLE, true)).toEqual({
      ok: false,
      refusal: 'tournament-finished',
    });
    expect(await outcomeRows()).toEqual([]);
    expect(await finalMarked()).toBe(false);
  });

  it('standings facts: a tournament that is gone is refused', async () => {
    expect(await facts(TABLE, false, {}, { ...TOURNAMENT, id: 99 })).toEqual({
      ok: false,
      refusal: 'no-tournament',
    });
  });

  it('standings facts: a refusal inside a caller`s transaction writes nothing there', async () => {
    const outcomes = await db.transaction(async (tx) => {
      const refused = await saveStandingsFacts(tx, {
        tournament: TOURNAMENT,
        entry: { rows: TABLE.slice(0, 2), final: true },
        role: 'superadmin',
        now: NOW,
      });
      const accepted = await saveStandingsFacts(tx, {
        tournament: TOURNAMENT,
        entry: { rows: TABLE, final: true },
        role: 'superadmin',
        now: NOW,
      });
      return [refused.ok, accepted.ok];
    });
    expect(outcomes).toEqual([false, true]);
    expect(await finalMarked()).toBe(true);
  });

  it('standings facts: a tournament lock held past 5 s fails the save cleanly (lock_not_available), writing nothing', async () => {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock($1::int, $2::int)', [
        RECALCULATION_LOCK_NAMESPACE,
        TOURNAMENT.id,
      ]);
      await expect(facts(TABLE, false)).rejects.toMatchObject({
        cause: { code: '55P03' },
      });
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await outcomeRows()).toEqual([]);
  }, 15_000);
});

describe('renameTeam (updateTeamDetails)', () => {
  const rename = (teamID: string, teamName: string) => {
    const entry = teamRenameEntry({ teamID, teamName });
    if (!entry.ok) throw new Error('test: the form does not pass');
    return renameTeam(db, { tournament: TOURNAMENT, rename: entry.value });
  };

  it('team rename: the name is changed, nothing else', async () => {
    const before = await standingsTotal();
    expect(await rename('11', 'Žalgiris Kaunas')).toEqual({
      ok: true,
      value: null,
    });
    expect(
      (await client.query('select name from teams where id = 11')).rows,
    ).toEqual([{ name: 'Žalgiris Kaunas' }]);
    expect((await standingsTotal())?.tenThousandths).toBe(
      before?.tenThousandths,
    );
  });

  it('team rename: a team of another tournament, or none, is unknown (issue 273)', async () => {
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (31, 4, 'Other')",
    );
    expect(await rename('31', 'X')).toEqual({
      ok: false,
      refusal: 'unknown-team',
    });
    expect(await rename('99', 'X')).toEqual({
      ok: false,
      refusal: 'unknown-team',
    });
    expect(
      (await client.query('select name from teams where id = 31')).rows,
    ).toEqual([{ name: 'Other' }]);
  });

  it('team rename: a finished tournament still allows it (a rename moves no point)', async () => {
    await client.query(
      "update tournaments set ends_on = '2026-10-10' where id = 3",
    );
    expect((await rename('11', 'Žalgiris')).ok).toBe(true);
  });
});

describe('insertPlaceholderTeams (insertTeams, issue 281)', () => {
  const newTournament = async () =>
    unwrap(
      await createTournament(db, {
        name: 'Euroleague 2028/29',
        slug: 'euroleague-2028-29',
        standingsDeadlineRound: null,
        status: 'upcoming',
        startsOn: null,
        endsOn: null,
        description: null,
        isPublic: true,
        survival: true,
      }),
    );

  const insert = (teamCount: string, tournament = TOURNAMENT) =>
    insertPlaceholderTeams(db, {
      tournament,
      teamCount,
      now: NOW,
    });

  it('placeholder teams: team1 to teamN, an empty outcome each, and every player`s blank standings rows', async () => {
    const fresh = await newTournament();
    await savePlaying(db, fresh, ADA, BEN);
    const inserted = unwrap(await insert('3', fresh));
    expect(inserted.teams).toHaveLength(3);
    expect(
      (
        await client.query(
          'select name from teams where tournament_id = $1 order by id',
          [fresh.id],
        )
      ).rows,
    ).toEqual([{ name: 'team1' }, { name: 'team2' }, { name: 'team3' }]);
    expect(
      (
        await client.query(
          'select count(*)::int as n from team_outcomes o join teams t on t.id = o.team_id where t.tournament_id = $1 and o.place is null and not o.play_offs and not o.final_four and o.final_place is null',
          [fresh.id],
        )
      ).rows,
    ).toEqual([{ n: 3 }]);
    expect(
      (
        await client.query(
          'select player_id, count(*)::int as n from standings_predictions p join teams t on t.id = p.team_id where t.tournament_id = $1 group by player_id order by player_id',
          [fresh.id],
        )
      ).rows,
    ).toEqual([
      { player_id: 1, n: 3 },
      { player_id: 2, n: 3 },
    ]);
  });

  it('placeholder teams: a player of another tournament gets none', async () => {
    const fresh = await newTournament();
    await savePlaying(db, fresh, ADA);
    unwrap(await insert('2', fresh));
    expect(
      (
        await client.query(
          'select count(*)::int as n from standings_predictions where player_id = 2 and team_id in (select id from teams where tournament_id = $1)',
          [fresh.id],
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
  });

  it('placeholder teams: a tournament that has teams is refused, nothing written', async () => {
    expect(await insert('4')).toEqual({ ok: false, refusal: 'teams-exist' });
    expect(
      (await client.query('select count(*)::int as n from teams')).rows,
    ).toEqual([{ n: 4 }]);
  });

  it.each([
    ['1', 'below-minimum'],
    ['65', 'above-maximum'],
    ['x', 'not-an-integer'],
    ['', 'required'],
  ] as const)(
    'placeholder teams: the count %j is %s',
    async (count, refusal) => {
      const fresh = await newTournament();
      expect(await insert(count, fresh)).toEqual({ ok: false, refusal });
    },
  );

  it('placeholder teams: a finished tournament refuses them (R-110)', async () => {
    const fresh = unwrap(
      await createTournament(db, {
        name: 'Sena',
        slug: 'sena',
        standingsDeadlineRound: null,
        status: 'upcoming',
        startsOn: null,
        endsOn: '2026-01-01',
        description: null,
        isPublic: true,
        survival: true,
      }),
    );
    expect(await insert('4', fresh)).toEqual({
      ok: false,
      refusal: 'tournament-finished',
    });
  });

  it('placeholder teams: a tournament that is gone is refused', async () => {
    expect(await insert('4', { ...TOURNAMENT, id: 99 })).toEqual({
      ok: false,
      refusal: 'no-tournament',
    });
  });
});
