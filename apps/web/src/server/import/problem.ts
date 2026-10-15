import type { ApplyRefusal, ImportResult } from '@sportbet/db';
import type { FeedFailure, FeedRefusal } from '@sportbet/domain';
import { z } from 'zod';

/** The longest a team's name goes into a message: a cookie holds 4 KB. */
const NAME_LENGTH = 40;

/** The most teams one message lists. */
const MAX_TEAMS = 20;

const name = z.string().min(1).max(NAME_LENGTH);

/**
 * Why the import did nothing, as the one-time message carries it (a key and
 * what it is about, never text: the words are the components', decision 13).
 * The plan's and the apply's refusals, the feed's failures and its refusals
 * (sportbet's exceptions), and a season code that is not one.
 */
export const importProblemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bad-season') }).readonly(),
  z.object({ kind: z.literal('unreachable') }).readonly(),
  z.object({ kind: z.literal('not-json') }).readonly(),
  z.object({ kind: z.literal('no-games') }).readonly(),
  z.object({ kind: z.literal('tournament-finished') }).readonly(),
  z.object({ kind: z.literal('plan-changed') }).readonly(),
  z.object({ kind: z.literal('no-tournament') }).readonly(),
  z
    .object({
      kind: z.literal('http-error'),
      status: z.int().min(100).max(599),
      season: z.string().max(8),
    })
    .readonly(),
  z
    .object({
      kind: z.literal('malformed'),
      number: z.int().positive(),
      field: z.string().max(40),
    })
    .readonly(),
  z.object({ kind: z.literal('duplicate-team-names'), team: name }).readonly(),
  z
    .object({
      kind: z.literal('unmatched-teams'),
      teams: z.array(name).min(1).max(MAX_TEAMS),
    })
    .readonly(),
  z
    .object({ kind: z.literal('round-not-regular'), round: z.int().positive() })
    .readonly(),
  z
    .object({
      kind: z.literal('duplicate-fixture'),
      round: z.int().positive(),
      home: name,
      away: name,
    })
    .readonly(),
]);

export type ImportProblem = z.infer<typeof importProblemSchema>;

const clip = (text: string): string => text.slice(0, NAME_LENGTH);

type Source = ApplyRefusal | FeedFailure | FeedRefusal;

type PlainKind =
  | 'unreachable'
  | 'not-json'
  | 'no-games'
  | 'tournament-finished'
  | 'plan-changed'
  | 'no-tournament';

/** The sources that are a problem as they are: nothing but their kind. */
const PLAIN_KINDS: ReadonlySet<string> = new Set<PlainKind>([
  'unreachable',
  'not-json',
  'no-games',
  'tournament-finished',
  'plan-changed',
  'no-tournament',
]);

type Plain = Extract<Source, { readonly kind: PlainKind }>;

const isPlain = (source: Source): source is Plain =>
  PLAIN_KINDS.has(source.kind);

/** A source with something to say about itself: the season it asked for, the game, the names (clipped). */
function detailed(
  source: Exclude<Source, Plain>,
  season: string,
): ImportProblem {
  switch (source.kind) {
    case 'http-error':
      return { kind: 'http-error', status: source.status, season };
    case 'malformed':
      return {
        kind: 'malformed',
        number: source.number,
        field: source.field,
      };
    case 'duplicate-team-names':
      return { kind: 'duplicate-team-names', team: clip(source.team) };
    case 'unmatched-teams':
      return {
        kind: 'unmatched-teams',
        teams: source.teams.slice(0, MAX_TEAMS).map(clip),
      };
    case 'round-not-regular':
      return { kind: 'round-not-regular', round: source.round };
    case 'duplicate-fixture':
      return {
        kind: 'duplicate-fixture',
        round: source.round,
        home: clip(source.home),
        away: clip(source.away),
      };
  }
}

/** What stopped the import, as a message; `season` is the one asked of the feed (an HTTP error names it). */
export function importProblem(source: Source, season: string): ImportProblem {
  return isPlain(source) ? { kind: source.kind } : detailed(source, season);
}

const count = z.int().min(0).max(1_000_000);

/**
 * What an apply did, as the one-time message carries it (sportbet's "Importuota:
 * ..." flash, R-96's crestless teams in place of its crest count).
 */
export const importedSchema = z
  .object({
    teams: count,
    rounds: count,
    games: count,
    moved: count,
    skipped: count,
    players: count,
    withoutCrest: z.array(name).max(MAX_TEAMS),
  })
  .readonly();

export type Imported = z.infer<typeof importedSchema>;

/** An apply's counts as a message; the crestless teams past the most one holds are left off. */
export function imported(result: ImportResult): Imported {
  return {
    teams: result.teams,
    rounds: result.rounds,
    games: result.games,
    moved: result.moved,
    skipped: result.skipped,
    players: result.playersSeeded,
    withoutCrest: result.teamsWithoutCrest.slice(0, MAX_TEAMS).map(clip),
  };
}
