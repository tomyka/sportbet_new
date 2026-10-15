import { z } from 'zod';
import { postSave, SAVE_NOT_SAVED } from '../save/laravel-save';
import type { PaymentsOutcome } from './payments-session';

/** The autosave's JSON: the totals in cents (the plain strings beside them are sportbet's, not read here). */
const savedSchema = z.object({
  saved: z.literal(true),
  collectedCents: z.int().nonnegative(),
  expectedCents: z.int().nonnegative(),
  paidCount: z.int().nonnegative(),
  memberCount: z.int().nonnegative(),
});

/**
 * A payments save's answer as the board shows it: a 200 with the totals is
 * saved; anything else - a refusal, a lost session, a body that is not the
 * answer - is "not saved" (the row says Neišsaugota).
 */
export function readPaymentsAnswer(
  status: number,
  body: unknown,
): PaymentsOutcome {
  const parsed = status === 200 ? savedSchema.safeParse(body) : null;
  if (!parsed?.success) {
    return { kind: 'refused', message: SAVE_NOT_SAVED };
  }
  return {
    kind: 'saved',
    totals: {
      collected: parsed.data.collectedCents,
      expected: parsed.data.expectedCents,
      paidCount: parsed.data.paidCount,
      memberCount: parsed.data.memberCount,
    },
  };
}

/** Posts one row as sportbet's board does (`paid[<id>]=<text>`) to the board's save address, and reads the answer. */
export const postPayment =
  (savePath: string) =>
  (member: number, raw: string): Promise<PaymentsOutcome> =>
    postSave(
      savePath,
      new URLSearchParams({ [`paid[${String(member)}]`]: raw }),
      readPaymentsAnswer,
    );
