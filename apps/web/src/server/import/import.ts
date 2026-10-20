import {
  applyEuroleagueImport,
  type ApplyRefusal,
  type ApplyRequest,
  type ImportResult,
} from '@sportbet/db';
import {
  previewEuroleagueImport,
  type ImportPreview,
  type ImportRequest,
  type PreviewRefusal,
} from '@sportbet/db/import';
import {
  adminWriteLimits,
  importPreviewLimits,
  seasonCodeSchema,
  type DetailedResult,
  type EuroleagueFeed,
  type ImportPlan,
  type Instant,
  type PlayerId,
  type SeasonCode,
  type ThrottleLimit,
  type Tournament,
} from '@sportbet/domain';
import {
  ADMIN_IMPORT_PATH,
  importPreviewPath,
} from '../../components/admin/admin-paths';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { pointsChanged } from '../points-changed';
import { formText } from '../request/form-input';
import { throttle, type ThrottleVerdict } from '../sign-in/throttle';
import type { AdminRequest } from '../admin/admin-action';
import { said, throttledTo, type AdminAnswer } from '../admin/admin-answer';
import { workingTournament } from '../admin/working-tournament';
import { chosenFeed, readSeason } from './feed';
import { imported, importProblem, type ImportProblem } from './problem';

/** What the use cases need of the world: the admin's tournament, the feed, the clock, the limits, the db's decisions. */
export interface ImportWorld {
  readonly tournament: (player: PlayerId) => Promise<Tournament | null>;
  readonly feed: EuroleagueFeed;
  readonly now: () => Instant;
  readonly allow: (
    limits: readonly ThrottleLimit[],
    at: Instant,
  ) => Promise<ThrottleVerdict>;
  readonly preview: (
    request: ImportRequest,
  ) => Promise<DetailedResult<ImportPreview, PreviewRefusal>>;
  readonly apply: (
    request: ApplyRequest,
  ) => Promise<DetailedResult<ImportResult, ApplyRefusal>>;
  /** Tells the cached reads of points that they changed. */
  readonly pointsChanged: () => void;
}

/** The real database, clock, throttle and feed. */
const importWorld: ImportWorld = {
  tournament: workingTournament,
  get feed() {
    return chosenFeed();
  },
  now,
  allow: (limits, at) => throttle(getDb(), limits, at),
  preview: (request) => previewEuroleagueImport(getDb(), request),
  apply: (request) => applyEuroleagueImport(getDb(), request),
  pointsChanged,
};

/** A SHA-256 in hex, which is what a preview's fingerprint is. */
const FINGERPRINT = /^[0-9a-f]{64}$/u;

/** The season code a text is, or null (EuroleagueImportController::validated's regex). */
function seasonOf(text: string): SeasonCode | null {
  const parsed = seasonCodeSchema.safeParse(text);
  return parsed.success ? parsed.data : null;
}

/** The posted `season` and `fingerprint`, each null when it is not what it should be. */
export function readImportForm(form: FormData): {
  readonly season: SeasonCode | null;
  readonly fingerprint: string | null;
} {
  const fingerprint = formText(form, 'fingerprint');
  return {
    season: seasonOf(formText(form, 'season')),
    fingerprint: FINGERPRINT.test(fingerprint) ? fingerprint : null,
  };
}

/** What the preview page shows: the plan, or why there is none. */
export type PreviewState =
  | { readonly kind: 'no-tournament' }
  | {
      readonly kind: 'problem';
      readonly tournament: Tournament;
      readonly problem: ImportProblem;
    }
  | {
      readonly kind: 'throttled';
      readonly tournament: Tournament;
      readonly minutes: number;
    }
  | {
      readonly kind: 'plan';
      readonly tournament: Tournament;
      readonly season: SeasonCode;
      readonly plan: ImportPlan;
      readonly fingerprint: string;
    };

/**
 * EuroleagueImportController::preview, for the tournament the admin works
 * on: the season code checked before anything is counted or fetched, the
 * previews limited per account (importPreviewLimits), the feed read, and the
 * plan and its fingerprint decided by the db (R-93). Writes nothing.
 */
export async function previewImport(
  player: PlayerId,
  seasonText: string,
  world: ImportWorld = importWorld,
): Promise<PreviewState> {
  const tournament = await world.tournament(player);
  if (tournament === null) return { kind: 'no-tournament' };
  const season = seasonOf(seasonText);
  if (season === null) {
    return { kind: 'problem', tournament, problem: { kind: 'bad-season' } };
  }
  const at = world.now();
  const verdict = await world.allow(importPreviewLimits(player), at);
  if (!verdict.allowed) {
    return { kind: 'throttled', tournament, minutes: verdict.minutes };
  }
  const feed = await readSeason(world.feed, season);
  if (!feed.ok) return { kind: 'problem', tournament, problem: feed.refusal };
  const preview = await world.preview({
    tournament,
    fixtures: feed.value.fixtures,
    postSeasonLeftOut: feed.value.postSeasonLeftOut,
    now: at,
  });
  return preview.ok
    ? {
        kind: 'plan',
        tournament,
        season,
        plan: preview.value.plan,
        fingerprint: preview.value.fingerprint,
      }
    : {
        kind: 'problem',
        tournament,
        problem: importProblem(preview.refusal, season),
      };
}

const refused = (to: string, problem: ImportProblem): AdminAnswer => ({
  kind: 'redirect',
  to,
  flash: { kind: 'import-refused', problem },
});

/** A refusal of the apply: R-93's goes back to the preview it came from, any other to the form. */
function refusedApply(refusal: ApplyRefusal, season: SeasonCode): AdminAnswer {
  const problem = importProblem(refusal, season);
  return refused(
    refusal.kind === 'plan-changed'
      ? importPreviewPath(season)
      : ADMIN_IMPORT_PATH,
    problem,
  );
}

/**
 * EuroleagueImportController::store, for the tournament the admin works on:
 * the posted season and fingerprint checked, the write counted against
 * adminWriteLimits, the feed read again (never trusted from the preview), and
 * the db's one write path (applyEuroleagueImport) applied only if the plan it
 * decides now is the one the admin previewed (R-93). A refusal writes
 * nothing; a result tells the cached points they changed.
 */
export async function saveImport(
  { admin, form }: AdminRequest,
  world: ImportWorld = importWorld,
): Promise<AdminAnswer> {
  const tournament = await world.tournament(admin.player);
  if (tournament === null) return said(ADMIN_IMPORT_PATH, 'no-tournament');
  const { season, fingerprint } = readImportForm(form);
  if (season === null) {
    return refused(ADMIN_IMPORT_PATH, { kind: 'bad-season' });
  }
  if (fingerprint === null) {
    return refused(importPreviewPath(season), { kind: 'plan-changed' });
  }
  const at = world.now();
  const verdict = await world.allow(adminWriteLimits(admin.player), at);
  if (!verdict.allowed) return throttledTo(ADMIN_IMPORT_PATH, verdict.minutes);
  const feed = await readSeason(world.feed, season);
  if (!feed.ok) return refused(ADMIN_IMPORT_PATH, feed.refusal);
  const applied = await world.apply({
    tournament,
    fixtures: feed.value.fixtures,
    postSeasonLeftOut: feed.value.postSeasonLeftOut,
    fingerprint,
    now: at,
  });
  if (!applied.ok) return refusedApply(applied.refusal, season);
  world.pointsChanged();
  return {
    kind: 'redirect',
    to: ADMIN_IMPORT_PATH,
    flash: { kind: 'imported', result: imported(applied.value) },
  };
}
