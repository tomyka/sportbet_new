import { z } from 'zod';
import {
  SAVE_NOT_SAVED,
  type Refusal,
} from '../../components/save/laravel-save';
import { throttledBody } from './laravel-answers';

// The answers every autosave's use case gives besides its own (the
// prediction save, the standings saves), written once: each fits any
// save's SaveAnswerOf.

/** PredictionSaveResponse::refused: 422 `{success: false, message}`. */
export const refusedAnswer = (
  message: string,
): { readonly status: 422; readonly body: Refusal } => ({
  status: 422,
  body: { success: false, message },
});

/** A save that waited past its lock_timeout (5 s): 503, try again. */
export const busyAnswer = (): {
  readonly status: 503;
  readonly body: Refusal;
} => ({ status: 503, body: { success: false, message: SAVE_NOT_SAVED } });

/** Too many saves: 429, with the sign-in throttles' text. */
export const throttledAnswer = (
  minutes: number,
): { readonly status: 429; readonly body: Refusal } => ({
  status: 429,
  body: throttledBody(minutes),
});

/** Postgres' lock_not_available (55P03), as the driver's error carries it in `cause`. */
const lockTimeoutSchema = z.object({
  cause: z.object({ code: z.literal('55P03') }),
});

/** Whether a save failed only because it waited too long for a lock. */
export function isLockTimeout(error: unknown): boolean {
  return lockTimeoutSchema.safeParse(error).success;
}
