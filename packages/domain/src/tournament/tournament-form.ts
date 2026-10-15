import { z } from 'zod';
import { roundNumber, type RoundNumber } from '../shared/ids';
import { laravelInteger } from '../shared/laravel-integer';
import { ok, refuse, type Result } from '../shared/result';
import { drawAllowed, type Format } from './format';
import { slugInvariant, tournamentNameInvariant } from './tournament';
import {
  TOURNAMENT_STATUSES,
  type TournamentStatus,
} from './tournament-profile';

/** A posted field of the tournament form, by sportbet's name (the dropped ones - sport, format, cover image - are not carried). */
export type TournamentField =
  | 'name'
  | 'slug'
  | 'standings_deadline_round'
  | 'status'
  | 'start_date'
  | 'end_date'
  | 'description'
  | 'is_public'
  | 'survival_game';

export type TournamentFormFields = Readonly<Record<TournamentField, string>>;

/** Why a field was refused. */
export type TournamentFieldProblem =
  | 'required'
  | 'too-long'
  | 'bad-slug'
  | 'not-an-integer'
  | 'below-minimum'
  | 'above-maximum'
  | 'unknown-status'
  | 'not-a-date'
  | 'before-start'
  | 'not-a-boolean'
  | 'survival-with-draws';

export interface TournamentFieldError {
  readonly field: TournamentField;
  readonly problem: TournamentFieldProblem;
}

/** What the admin entered for a tournament: its rules' fields and its hub profile's. */
export interface TournamentEntry {
  readonly name: string;
  readonly slug: string;
  /** Null is the format's own deadline round (ST-2). */
  readonly standingsDeadlineRound: RoundNumber | null;
  readonly status: TournamentStatus;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly description: string | null;
  readonly isPublic: boolean;
  readonly survival: boolean;
}

export type TournamentFormCheck =
  | { readonly ok: true; readonly value: TournamentEntry }
  | { readonly ok: false; readonly errors: readonly TournamentFieldError[] };

/** What the form is checked against: the format it saves, and what is stored (null for a new tournament). */
export interface TournamentFormContext {
  readonly format: Format;
  readonly stored: {
    readonly status: TournamentStatus;
    readonly survival: boolean;
  } | null;
}

const NAME_MAX = 255;
const SLUG_MAX = 100;
const DESCRIPTION_MAX = 1000;
const DEADLINE_ROUND_MAX = 255;

type Read<V> =
  | { readonly ok: true; readonly value: V }
  | { readonly ok: false; readonly error: TournamentFieldError };

const accepted = <V>(value: V): Read<V> => ({ ok: true, value });

function refused(
  field: TournamentField,
  problem: TournamentFieldProblem,
): Read<never> {
  return { ok: false, error: { field, problem } };
}

/** PHP's `max:` counts characters, not UTF-16 units. */
const lengthOf = (text: string): number => Array.from(text).length;

/** `required|string|max:255`, and a name with something in it. */
function nameRead(text: string): Read<string> {
  if (text === '' || !tournamentNameInvariant.schema.safeParse(text).success) {
    return refused('name', 'required');
  }
  return lengthOf(text) > NAME_MAX
    ? refused('name', 'too-long')
    : accepted(text);
}

/** `required|string|max:100|regex:/^[a-z0-9-]+$/`. */
function slugRead(text: string): Read<string> {
  if (text === '') return refused('slug', 'required');
  if (lengthOf(text) > SLUG_MAX) return refused('slug', 'too-long');
  return slugInvariant.schema.safeParse(text).success
    ? accepted(text)
    : refused('slug', 'bad-slug');
}

/** `nullable|integer|min:1|max:255`: blank is the format's own deadline round. */
function deadlineRead(text: string): Read<RoundNumber | null> {
  const field = 'standings_deadline_round';
  if (text === '') return accepted(null);
  const value = laravelInteger(text);
  if (value === null) return refused(field, 'not-an-integer');
  if (value < 1) return refused(field, 'below-minimum');
  const round = roundNumber(value);
  return value > DEADLINE_ROUND_MAX || !round.ok
    ? refused(field, 'above-maximum')
    : accepted(round.value);
}

/**
 * R-55: the form offers only `upcoming` and `active`; a stored `finished`
 * (an imported row) is accepted while it stays so, until the admin picks
 * one of the two.
 */
function statusRead(
  text: string,
  stored: TournamentFormContext['stored'],
): Read<TournamentStatus> {
  if (text === '') return refused('status', 'required');
  const status = TOURNAMENT_STATUSES.find((each) => each === text);
  const offered =
    status === 'upcoming' ||
    status === 'active' ||
    (status === 'finished' && stored?.status === 'finished');
  return status !== undefined && offered
    ? accepted(status)
    : refused('status', 'unknown-status');
}

/** `nullable|date`, read as the date input posts it: a real `YYYY-MM-DD`. */
function dateRead(
  field: 'start_date' | 'end_date',
  text: string,
): Read<string | null> {
  if (text === '') return accepted(null);
  return z.iso.date().safeParse(text).success
    ? accepted(text)
    : refused(field, 'not-a-date');
}

/** `nullable|date|after_or_equal:start_date`, compared only when both are given. */
function endRead(
  text: string,
  start: Read<string | null>,
): Read<string | null> {
  const end = dateRead('end_date', text);
  if (!end.ok || !start.ok || start.value === null || end.value === null) {
    return end;
  }
  return end.value < start.value ? refused('end_date', 'before-start') : end;
}

/** `nullable|string|max:1000`. */
function descriptionRead(text: string): Read<string | null> {
  if (text === '') return accepted(null);
  return lengthOf(text) > DESCRIPTION_MAX
    ? refused('description', 'too-long')
    : accepted(text);
}

/** Laravel's `boolean` on a checkbox: absent, `0` or `1`; read by `$request->boolean()`. */
function switchRead(
  field: 'is_public' | 'survival_game',
  text: string,
): Read<boolean> {
  if (text === '' || text === '0') return accepted(false);
  return text === '1' ? accepted(true) : refused(field, 'not-a-boolean');
}

/**
 * Issue 228, the owner's rule (refuseSurvivalWithDraws): survival is only
 * for a format without draws. The one exception is a tournament that
 * already has survival on and keeps its format; once switched off there, it
 * cannot be switched back on.
 */
export function survivalAllowed(input: {
  readonly survival: boolean;
  readonly drawAllowed: boolean;
  readonly existing: {
    readonly survival: boolean;
    readonly sameFormat: boolean;
  } | null;
}): boolean {
  if (!input.survival || !input.drawAllowed) return true;
  return input.existing?.survival === true && input.existing.sameFormat;
}

function survivalRead(
  text: string,
  context: TournamentFormContext,
): Read<boolean> {
  const survival = switchRead('survival_game', text);
  if (!survival.ok) return survival;
  const allowed = survivalAllowed({
    survival: survival.value,
    drawAllowed: drawAllowed(context.format),
    existing:
      context.stored === null
        ? null
        : { survival: context.stored.survival, sameFormat: true },
  });
  return allowed ? survival : refused('survival_game', 'survival-with-draws');
}

/**
 * TournamentController::adminStore's and adminUpdate's rules on the
 * trimmed fields, every failing field listed (Laravel reports each) in
 * their order: name, slug, deadline round, status (R-55), start and end
 * dates (the end not before the start), description, the public switch,
 * survival. The slug's uniqueness is the database's: a typed refusal from
 * the writer.
 */
export function tournamentFormEntry(
  fields: TournamentFormFields,
  context: TournamentFormContext,
): TournamentFormCheck {
  const start = dateRead('start_date', fields.start_date);
  const reads = {
    name: nameRead(fields.name),
    slug: slugRead(fields.slug),
    deadline: deadlineRead(fields.standings_deadline_round),
    status: statusRead(fields.status, context.stored),
    start,
    end: endRead(fields.end_date, start),
    description: descriptionRead(fields.description),
    isPublic: switchRead('is_public', fields.is_public),
    survival: survivalRead(fields.survival_game, context),
  };
  if (!allAccepted(reads)) {
    return {
      ok: false,
      errors: Object.values(reads).flatMap((read) =>
        read.ok ? [] : [read.error],
      ),
    };
  }
  return {
    ok: true,
    value: {
      name: reads.name.value,
      slug: reads.slug.value,
      standingsDeadlineRound: reads.deadline.value,
      status: reads.status.value,
      startsOn: reads.start.value,
      endsOn: reads.end.value,
      description: reads.description.value,
      isPublic: reads.isPublic.value,
      survival: reads.survival.value,
    },
  };
}

type Accepted<R> = Extract<R, { readonly ok: true }>;

const allAccepted = <T extends Record<string, Read<unknown>>>(
  reads: T,
): reads is { [K in keyof T]: Accepted<T[K]> } =>
  Object.values(reads).every((read) => read.ok);

export type TournamentChangeRefusal = 'tournament-finished';

/** What a tournament change is decided against: the stored fields that can move points (R-110). */
export interface StoredTournamentScoring {
  readonly endsOn: string | null;
  readonly survival: boolean;
  readonly standingsDeadlineRound: RoundNumber | null;
}

/**
 * Whether `entry` changes a field that can move points - the end date
 * (R-21's finish, R-22's freeze), survival, or the standings deadline round
 * (ST-2) - from what is stored.
 */
function changesScoring(
  old: StoredTournamentScoring,
  entry: TournamentEntry,
): boolean {
  return (
    entry.endsOn !== old.endsOn ||
    entry.survival !== old.survival ||
    entry.standingsDeadlineRound !== old.standingsDeadlineRound
  );
}

/**
 * R-110 (with R-22, R-67): on a finished tournament nothing that can move
 * points changes, so a changed end date, survival or deadline round is
 * refused; the name, slug, description, public switch, status and start date
 * stay editable.
 */
export function tournamentChange(
  old: StoredTournamentScoring,
  entry: TournamentEntry,
  context: { readonly finished: boolean },
): Result<TournamentEntry, TournamentChangeRefusal> {
  return context.finished && changesScoring(old, entry)
    ? refuse('tournament-finished')
    : ok(entry);
}
