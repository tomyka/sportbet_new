import type { ApplyRequest, ImportPreview, ImportRequest } from '@sportbet/db';
import {
  isNoop,
  ok,
  refuseWith,
  ruledRules,
  type EuroleagueFeed,
  type ImportPlan,
  type Tournament,
} from '@sportbet/domain';
import { at, player } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import type { SignedInPlayer } from '@sportbet/db';
import {
  previewImport,
  readImportForm,
  saveImport,
  type ImportWorld,
} from './import';

// The import's two use cases, thin: gate and limits, the admin's tournament,
// the feed, then the db function that decides (planEuroleagueImport,
// applyEuroleagueImport). Nothing here knows a rule.

const NOW = at('2026-10-15T12:00:00Z');
const TOURNAMENT: Tournament = {
  id: 41,
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};
const ADMIN = player('1');
const FINGERPRINT = 'a'.repeat(64);

const GAME = {
  round: 1,
  utcDate: '2026-09-24T16:00:00Z',
  local: { club: { name: 'Real Madrid' } },
  road: { club: { name: 'FC Barcelona' } },
  phaseType: { code: 'RS' },
};

const PLAN: ImportPlan = {
  teamsToCreate: ['Real Madrid', 'FC Barcelona'],
  roundsToCreate: [],
  gamesToCreate: [],
  moves: [],
  skippedMoves: [],
  unchanged: 0,
  dropped: [],
  postSeasonLeftOut: 0,
  teamsWithoutCrest: [],
  playersAffected: 0,
};

interface Calls {
  readonly previews: ImportRequest[];
  readonly applies: ApplyRequest[];
  readonly limits: string[];
  changed: number;
}

/** A world whose every part answers what the test gives it, and remembers what it was asked. */
function worldOf(overrides: Partial<ImportWorld> = {}): {
  world: ImportWorld;
  calls: Calls;
} {
  const calls: Calls = { previews: [], applies: [], limits: [], changed: 0 };
  const feed: EuroleagueFeed = {
    games: () => Promise.resolve(ok({ data: [GAME] })),
  };
  const world: ImportWorld = {
    tournament: () => Promise.resolve(TOURNAMENT),
    feed,
    now: () => NOW,
    allow: (limits) => {
      calls.limits.push(limits.map(({ key }) => key).join());
      return Promise.resolve({ allowed: true });
    },
    preview: (request) => {
      calls.previews.push(request);
      return Promise.resolve(
        ok<ImportPreview>({ plan: PLAN, fingerprint: FINGERPRINT }),
      );
    },
    apply: (request) => {
      calls.applies.push(request);
      return Promise.resolve(
        ok({
          teams: 2,
          rounds: 1,
          games: 1,
          moved: 0,
          skipped: 0,
          playersSeeded: 3,
          teamsWithoutCrest: [],
        }),
      );
    },
    pointsChanged: () => {
      calls.changed += 1;
    },
    ...overrides,
  };
  return { world, calls };
}

const admin: SignedInPlayer = {
  player: ADMIN,
  name: 'Jonas',
  surname: 'Jonaitis',
  role: 'superadmin',
  lastTournament: null,
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe('readImportForm', () => {
  it('reads the season and the fingerprint, trimmed', () => {
    expect(
      readImportForm(
        form({ season: ' E2026 ', fingerprint: ` ${FINGERPRINT}` }),
      ),
    ).toEqual({ season: 'E2026', fingerprint: FINGERPRINT });
  });

  it('reads a season that is no code as null, and a fingerprint that is no SHA-256 as null', () => {
    expect(
      readImportForm(form({ season: 'e2026', fingerprint: 'abc' })),
    ).toEqual({ season: null, fingerprint: null });
    expect(readImportForm(new FormData())).toEqual({
      season: null,
      fingerprint: null,
    });
  });
});

describe('previewImport', () => {
  it('without a tournament says so, and asks nothing', async () => {
    const { world, calls } = worldOf({
      tournament: () => Promise.resolve(null),
    });
    expect(await previewImport(ADMIN, 'E2026', world)).toEqual({
      kind: 'no-tournament',
    });
    expect(calls.limits).toEqual([]);
  });

  it('refuses a season code that is none before the limit counts or the feed is asked', async () => {
    const { world, calls } = worldOf();
    expect(await previewImport(ADMIN, 'e2026', world)).toMatchObject({
      kind: 'problem',
      problem: { kind: 'bad-season' },
    });
    expect(calls.limits).toEqual([]);
    expect(calls.previews).toEqual([]);
  });

  it('is the plan and its fingerprint, from the feed read once, under the live rules', async () => {
    const { world, calls } = worldOf();
    const state = await previewImport(ADMIN, 'E2026', world);
    expect(state).toMatchObject({
      kind: 'plan',
      season: 'E2026',
      plan: PLAN,
      fingerprint: FINGERPRINT,
    });
    expect(calls.limits).toEqual([`import-preview:player:${ADMIN}`]);
    expect(calls.previews).toHaveLength(1);
    expect(calls.previews[0]).toMatchObject({
      tournament: TOURNAMENT,
      now: NOW,
      rules: ruledRules,
      postSeasonLeftOut: 0,
    });
    expect(calls.previews[0]?.fixtures).toHaveLength(1);
    expect(isNoop(PLAN)).toBe(false);
  });

  it('says for how long when the previews are too many, and reads no feed', async () => {
    let asked = 0;
    const { world } = worldOf({
      allow: () => Promise.resolve({ allowed: false, minutes: 2 }),
      feed: {
        games: () => {
          asked += 1;
          return Promise.resolve(ok({}));
        },
      },
    });
    expect(await previewImport(ADMIN, 'E2026', world)).toMatchObject({
      kind: 'throttled',
      minutes: 2,
    });
    expect(asked).toBe(0);
  });

  it("is the feed's failure as a problem, and the plan's refusal as one", async () => {
    const failing = worldOf({
      feed: {
        games: () => Promise.resolve(refuseWith({ kind: 'unreachable' })),
      },
    });
    expect(await previewImport(ADMIN, 'E2026', failing.world)).toMatchObject({
      kind: 'problem',
      problem: { kind: 'unreachable' },
    });
    const refused = worldOf({
      preview: () =>
        Promise.resolve(refuseWith({ kind: 'tournament-finished' })),
    });
    expect(await previewImport(ADMIN, 'E2026', refused.world)).toMatchObject({
      kind: 'problem',
      problem: { kind: 'tournament-finished' },
    });
  });
});

describe('saveImport', () => {
  const posted = form({ season: 'E2026', fingerprint: FINGERPRINT });

  it('applies the plan the admin previewed, then says what it did and refreshes the points', async () => {
    const { world, calls } = worldOf();
    const answer = await saveImport({ admin, form: posted }, world);
    expect(answer).toEqual({
      kind: 'redirect',
      to: '/admin/import',
      flash: {
        kind: 'imported',
        result: {
          teams: 2,
          rounds: 1,
          games: 1,
          moved: 0,
          skipped: 0,
          players: 3,
          withoutCrest: [],
        },
      },
    });
    expect(calls.applies).toHaveLength(1);
    expect(calls.applies[0]).toMatchObject({
      tournament: TOURNAMENT,
      fingerprint: FINGERPRINT,
      now: NOW,
      rules: ruledRules,
    });
    expect(calls.limits).toEqual([`admin-write:player:${ADMIN}`]);
    expect(calls.changed).toBe(1);
  });

  it('sends a changed plan back to the preview of the same season (R-93), refreshing nothing', async () => {
    const { world, calls } = worldOf({
      apply: () => Promise.resolve(refuseWith({ kind: 'plan-changed' })),
    });
    expect(await saveImport({ admin, form: posted }, world)).toEqual({
      kind: 'redirect',
      to: '/admin/import/preview?season=E2026',
      flash: { kind: 'import-refused', problem: { kind: 'plan-changed' } },
    });
    expect(calls.changed).toBe(0);
  });

  it('sends any other refusal to the form', async () => {
    const { world } = worldOf({
      apply: () =>
        Promise.resolve(refuseWith({ kind: 'round-not-regular', round: 3 })),
    });
    expect(await saveImport({ admin, form: posted }, world)).toEqual({
      kind: 'redirect',
      to: '/admin/import',
      flash: {
        kind: 'import-refused',
        problem: { kind: 'round-not-regular', round: 3 },
      },
    });
  });

  it("sends the feed's failure to the form, writing nothing", async () => {
    const { world, calls } = worldOf({
      feed: {
        games: () => Promise.resolve(refuseWith({ kind: 'not-json' })),
      },
    });
    expect(await saveImport({ admin, form: posted }, world)).toMatchObject({
      to: '/admin/import',
      flash: { kind: 'import-refused', problem: { kind: 'not-json' } },
    });
    expect(calls.applies).toEqual([]);
  });

  it('refuses a bad season code to the form, and a fingerprint that is none to the preview, before anything is counted', async () => {
    const { world, calls } = worldOf();
    expect(
      await saveImport(
        { admin, form: form({ season: 'x', fingerprint: FINGERPRINT }) },
        world,
      ),
    ).toMatchObject({
      to: '/admin/import',
      flash: { kind: 'import-refused', problem: { kind: 'bad-season' } },
    });
    expect(
      await saveImport(
        { admin, form: form({ season: 'E2026', fingerprint: 'nope' }) },
        world,
      ),
    ).toMatchObject({
      to: '/admin/import/preview?season=E2026',
      flash: { kind: 'import-refused', problem: { kind: 'plan-changed' } },
    });
    expect(calls.limits).toEqual([]);
  });

  it('without a tournament says so, and says for how long when the writes are too many', async () => {
    const none = worldOf({ tournament: () => Promise.resolve(null) });
    expect(await saveImport({ admin, form: posted }, none.world)).toEqual({
      kind: 'redirect',
      to: '/admin/import',
      flash: { kind: 'admin', message: 'no-tournament' },
    });
    const throttled = worldOf({
      allow: () => Promise.resolve({ allowed: false, minutes: 3 }),
    });
    expect(await saveImport({ admin, form: posted }, throttled.world)).toEqual({
      kind: 'redirect',
      to: '/admin/import',
      flash: { kind: 'throttled', minutes: 3 },
    });
    expect(throttled.calls.applies).toEqual([]);
  });
});
