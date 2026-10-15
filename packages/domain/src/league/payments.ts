import type { RuleSet } from '../rules/rule-set';
import { phpTrim } from '../shared/php-trim';
import { ok, refuse, type Result } from '../shared/result';
import { ibanForDisplay } from './iban';
import type { Cents, League, LeagueMember } from './league';
import {
  amountInputText,
  barPercent,
  formatPot,
  leagueHasFee,
  pots,
} from './money';
import type { PaymentsEntry } from './payments-form';

/** Why a player may not manage a league's payments: both answer 403. */
export type PaymentsRefusal = 'public-league' | 'not-an-admin';

/**
 * LeaguePaymentController::authorizeLeagueAdmin: the public league first (its
 * payments are the superadmin's, even for a member who carries is_admin),
 * then the actor must be an admin member of this league. `actorMember` is the
 * actor's own row, read from the database now, never from the session.
 */
export function mayManagePayments(input: {
  readonly league: League;
  readonly actorMember: LeagueMember | null;
}): Result<true, PaymentsRefusal> {
  const { league, actorMember } = input;
  if (league.kind.public) return refuse('public-league');
  return actorMember !== null &&
    actorMember.league === league.id &&
    actorMember.isAdmin
    ? ok(true)
    : refuse('not-an-admin');
}

/** One member's recorded amount, as the writer saves it. */
export interface PaymentWrite {
  readonly member: number;
  readonly paid: Cents | null;
}

/**
 * LeaguePaymentController::update then record(): authority first, then every
 * posted id must be a member of this league (`count` equality), or nothing is
 * written. The writes come in member id order.
 */
export function recordPayments(input: {
  readonly league: League;
  readonly actorMember: LeagueMember | null;
  readonly members: readonly LeagueMember[];
  readonly entry: PaymentsEntry;
}): Result<readonly PaymentWrite[], PaymentsRefusal | 'unknown-member'> {
  const allowed = mayManagePayments(input);
  if (!allowed.ok) return allowed;
  const { league, members, entry } = input;
  const named = members
    .filter((member) => member.league === league.id && entry.has(member.id))
    .toSorted((a, b) => a.id - b.id);
  if (named.length !== entry.size) return refuse('unknown-member');
  return ok(
    named.map((member) => ({
      member: member.id,
      paid: entry.get(member.id) ?? null,
    })),
  );
}

/** What the autosave's answer and the meter hold, in cents and counts. */
export interface PaymentTotals {
  readonly collected: number;
  readonly expected: number;
  readonly paidCount: number;
  readonly memberCount: number;
}

/**
 * LeaguePaymentController::totals: the pots (R-88) and how many of the
 * league's members have an amount recorded, out of all of them.
 */
export function paymentTotals(input: {
  readonly league: League;
  readonly members: readonly LeagueMember[];
  readonly rules: RuleSet;
}): PaymentTotals {
  const { league, members, rules } = input;
  return {
    ...pots({ baseFee: league.fee.base, members, rules }),
    paidCount: members.filter((member) => member.paid !== null).length,
    memberCount: members.length,
  };
}

/** The meter as the page draws it (R-123: one format, `1,234.50`). */
export interface PaymentsMeter {
  /** `1,234.50`; the page adds the euro sign. */
  readonly collected: string;
  /** Only with a fee; `iš <expected>€`. */
  readonly expected: string | null;
  readonly paidCount: number;
  readonly memberCount: number;
  /** The bar's width in percent; null without a fee (no bar). */
  readonly percent: number | null;
}

/** The meter of some totals; the page and an autosave's answer use this alone. */
export function paymentsMeter(
  totals: PaymentTotals,
  hasFee: boolean,
): PaymentsMeter {
  return {
    collected: formatPot(totals.collected),
    expected: hasFee ? formatPot(totals.expected) : null,
    paidCount: totals.paidCount,
    memberCount: totals.memberCount,
    percent: hasFee ? barPercent(totals.collected, totals.expected) : null,
  };
}

/** A league member with the account's names; null for a member with no account. */
export interface PaymentsMember {
  readonly member: LeagueMember;
  readonly person: {
    readonly name: string;
    readonly surname: string;
    readonly username: string;
  } | null;
}

export interface PaymentsRow {
  readonly member: number;
  /** `trim(name . ' ' . surname)`; empty when there is no account. */
  readonly display: string;
  readonly username: string;
  readonly isGuest: boolean;
  /** An amount is recorded (the chip reads Sumokėta, else Nesumokėta). */
  readonly paid: boolean;
  /** What the amount box holds: `20`, `12.5`, empty. */
  readonly amountText: string;
}

export interface PaymentsPage {
  readonly league: { readonly id: League['id']; readonly name: string };
  readonly hasFee: boolean;
  readonly meter: PaymentsMeter;
  readonly rows: readonly PaymentsRow[];
  /** The details form's boxes: the beneficiary prefilled, the IBAN grouped. */
  readonly details: {
    readonly beneficiary: string;
    readonly iban: string;
    readonly note: string;
  };
}

/** PHP's `User::fullName()`: each part trimmed, then joined and trimmed. */
export function accountFullName(account: {
  readonly name: string;
  readonly surname: string;
}): string {
  return phpTrim(`${phpTrim(account.name)} ${phpTrim(account.surname)}`);
}

const sortKey = (person: PaymentsMember['person']): string =>
  person === null ? '' : accountFullName(person).toLowerCase();

/** Byte order of UTF-8 is code point order: compare by code points. */
function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  for (let at = 0; at < Math.min(left.length, right.length); at++) {
    const difference =
      (left[at]?.codePointAt(0) ?? 0) - (right[at]?.codePointAt(0) ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function rowOf({ member, person }: PaymentsMember): PaymentsRow {
  return {
    member: member.id,
    display: person === null ? '' : phpTrim(`${person.name} ${person.surname}`),
    username: person?.username ?? '',
    isGuest: member.isGuest,
    paid: member.paid !== null,
    amountText: amountInputText(member.paid),
  };
}

/**
 * `/leagues/{id}/payments` (LeaguePaymentController::viewData): the members
 * by lower-cased full name, compared by code point (PHP's `mb_strtolower` and
 * byte order, no Lithuanian collation), ties by membership id; the meter; and
 * the details form's boxes: the stored beneficiary, else the owner's full name
 * (offered, never written; none for a league with no owner), the IBAN grouped.
 */
export function paymentsPage(input: {
  readonly league: League;
  readonly members: readonly PaymentsMember[];
  readonly rules: RuleSet;
  readonly ownerName: string | null;
}): PaymentsPage {
  const { league, members, rules, ownerName } = input;
  const hasFee = leagueHasFee(league);
  const ordered = members.toSorted(
    (a, b) =>
      compareCodePoints(sortKey(a.person), sortKey(b.person)) ||
      a.member.id - b.member.id,
  );
  const stored = league.payment.beneficiary;
  return {
    league: { id: league.id, name: league.name },
    hasFee,
    meter: paymentsMeter(
      paymentTotals({
        league,
        members: members.map(({ member }) => member),
        rules,
      }),
      hasFee,
    ),
    rows: ordered.map(rowOf),
    details: {
      beneficiary:
        stored === null || stored === '' ? (ownerName ?? '') : stored,
      iban: ibanForDisplay(league.payment.iban ?? ''),
      note: league.payment.note ?? '',
    },
  };
}
