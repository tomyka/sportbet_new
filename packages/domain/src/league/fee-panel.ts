import type { RuleSet } from '../rules/rule-set';
import { phpTrim } from '../shared/php-trim';
import { ibanForDisplay } from './iban';
import type { League, LeagueMember } from './league';
import { formatFee, formatPot, leagueHasFee, pots } from './money';

/**
 * What a member writes in the payment-purpose field: one fixed line for every
 * league and member (PaymentReference::TEXT, sportbet issue 312).
 */
export const PAYMENT_REFERENCE = 'Jaunimo linijai';

/** Where to send the fee: the pop-up's three rows and its note. */
export interface FeePayment {
  readonly beneficiary: string;
  /** Grouped in fours. */
  readonly iban: string;
  readonly reference: string;
  readonly note: string | null;
}

/**
 * App\Support\FeePayment::forLeague: null unless the league names both a
 * beneficiary and an IBAN (League::hasPaymentDetails), else the rows as the
 * pop-up draws them; the note only when it is not blank.
 */
export function feePayment(league: League): FeePayment | null {
  const beneficiary = phpTrim(league.payment.beneficiary ?? '');
  const iban = phpTrim(league.payment.iban ?? '');
  if (beneficiary === '' || iban === '') return null;
  const note = phpTrim(league.payment.note ?? '');
  return {
    beneficiary,
    iban: ibanForDisplay(iban),
    reference: PAYMENT_REFERENCE,
    note: note === '' ? null : note,
  };
}

/** The "Kaip sumokėti" pop-up of a member who has not paid. */
export interface FeePopup {
  /** `20,00`: the line `Mokėti <amount> €`. */
  readonly amount: string;
  /** Null: the administrator has not said where to send it. */
  readonly payment: FeePayment | null;
}

/** The money half of the panel: what a guest under R-124 never sees. */
export interface FeeMoney {
  /** `due`: the red line and the pop-up; `paid`: the paid line. */
  readonly state: 'due' | 'paid';
  /** `1 234,00`: the fee in the due line. */
  readonly feeText: string;
  readonly counts: {
    /** Full members: `Dalyvių skaičius`. */
    readonly players: number;
    /** `1,234.50`, the pot as the panel prints it (R-123: one format). */
    readonly expected: string;
    readonly collected: string;
  };
  /** Only for `due`; a paid member gets no account number assembled. */
  readonly popup: FeePopup | null;
}

export interface FeePanel {
  /** Null: the viewer is a guest under `feeDueHiddenFromGuests` (R-124). */
  readonly money: FeeMoney | null;
  readonly reward: string | null;
}

function moneyOf(input: {
  readonly league: League;
  readonly viewer: LeagueMember;
  readonly members: readonly LeagueMember[];
  readonly rules: RuleSet;
}): FeeMoney {
  const { league, viewer, members, rules } = input;
  const pot = pots({ baseFee: league.fee.base, members, rules });
  const due = viewer.paid === null;
  return {
    state: due ? 'due' : 'paid',
    feeText: formatFee(league.fee.base ?? 0),
    counts: {
      players: members.filter((member) => !member.isGuest).length,
      expected: formatPot(pot.expected),
      collected: formatPot(pot.collected),
    },
    popup: due
      ? {
          amount: formatFee(league.fee.base ?? 0),
          payment: feePayment(league),
        }
      : null,
  };
}

/**
 * The dashboard's fee panel (partials/fee.blade.php, FeeController), decided
 * here: null for a league with no fee; else the money block - the due line
 * with its pop-up for a member with nothing recorded, the paid line for one
 * with an amount recorded (even 0), and the counts and pots - and the
 * league's reward text. A guest under `feeDueHiddenFromGuests` (R-104, R-124)
 * gets no money block at all, only the reward. `members` are all the league's.
 */
export function feePanel(input: {
  readonly league: League;
  readonly viewer: LeagueMember;
  readonly members: readonly LeagueMember[];
  readonly rules: RuleSet;
}): FeePanel | null {
  const { league, viewer, rules } = input;
  if (!leagueHasFee(league)) return null;
  const reward = league.fee.reward ?? '';
  return {
    money:
      rules.feeDueHiddenFromGuests && viewer.isGuest ? null : moneyOf(input),
    reward: reward === '' ? null : reward,
  };
}
