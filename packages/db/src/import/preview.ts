import {
  canonicalPlan,
  ok,
  planEuroleagueImport,
  refuseWith,
  type DetailedResult,
  type EuroleagueFixture,
  type ImportPlan,
  type ImportRefusal,
  type Instant,
  type Tournament,
} from '@sportbet/domain';
import { createHash } from 'node:crypto';
import type { Executor } from '../client';
import { findTournamentById } from '../tournament/repository';
import { loadImportState } from './state';

/** The feed as the import reads it (parseEuroleagueFeed's), for one tournament. */
export interface ImportRequest {
  /** The tournament imported into, by its id; read again. */
  readonly tournament: Tournament;
  readonly fixtures: readonly EuroleagueFixture[];
  readonly postSeasonLeftOut: number;
  readonly now: Instant;
}

export type PreviewRefusal = ImportRefusal | { readonly kind: 'no-tournament' };

export interface ImportPreview {
  readonly plan: ImportPlan;
  /** SHA-256 of the plan's canonical text (R-93), in hex. */
  readonly fingerprint: string;
}

/** R-93: the fingerprint of a plan, which an apply must reproduce. */
export function fingerprintOf(plan: ImportPlan): string {
  return createHash('sha256').update(canonicalPlan(plan)).digest('hex');
}

/**
 * What importing the feed into the tournament would do, and the fingerprint
 * of that plan. Reads only: nothing is written, locked or stored, and the
 * apply plans again (R-93).
 */
export async function previewEuroleagueImport(
  db: Executor,
  request: ImportRequest,
): Promise<DetailedResult<ImportPreview, PreviewRefusal>> {
  const tournament = await findTournamentById(db, request.tournament.id);
  if (tournament === undefined) return refuseWith({ kind: 'no-tournament' });
  const state = await loadImportState(db, tournament, request);
  const plan = planEuroleagueImport({
    ...state,
    fixtures: request.fixtures,
    postSeasonLeftOut: request.postSeasonLeftOut,
  });
  if (!plan.ok) return plan;
  return ok({ plan: plan.value, fingerprint: fingerprintOf(plan.value) });
}
