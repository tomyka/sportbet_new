import { z } from 'zod';

// Laravel's answers to an autosave, as sportbet's pages read them, written
// once for every save a page makes (the prediction save, the standings
// saves): the routes build their answers from these types and the pages
// read them back with them. Each save keeps only its own posted field
// names, its saved body and its wrappers.

/** The text for a save that did not go through and may be tried again (lang/lt.json). */
export const SAVE_NOT_SAVED = 'Spėjimas neišsaugotas. Bandykite dar kartą.';

/** 422 for a refusal (PredictionSaveResponse::refused), 429 for too many saves, 503 for a save that waited too long. */
export const refusalSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});

export type Refusal = z.infer<typeof refusalSchema>;

/** A failed FormRequest's 422: each of the save's fields' messages under its name, and `message`, the first. */
export interface FieldErrorsOf<Field extends string> {
  readonly message: string;
  readonly errors: Partial<Record<Field, string[]>>;
}

/** The 422 field-errors schema of a save whose fields are `fields`: no other name is read. */
export function fieldErrorsSchemaFor<
  const Fields extends readonly [string, ...string[]],
>(fields: Fields): z.ZodType<FieldErrorsOf<Fields[number]>> {
  return z.object({
    message: z.string(),
    errors: z.partialRecord(z.enum(fields), z.array(z.string())),
  });
}

/** Every answer a save's route gives besides a guest's 401 and a cross-site 403. */
export type SaveAnswerOf<Saved, Field extends string> =
  | { readonly status: 200; readonly body: Saved }
  | { readonly status: 422; readonly body: FieldErrorsOf<Field> | Refusal }
  | { readonly status: 429; readonly body: Refusal }
  /** The save waited too long for a lock (lock_timeout): try again. */
  | { readonly status: 503; readonly body: Refusal };

/** What a page shows of a save that did not go through. */
export interface NotSaved {
  readonly kind: 'refused';
  readonly message: string;
}

/**
 * A refused answer's message, as sportbet's pages show it (R-59): a 422
 * for the fields its first field's first error, else Laravel's summary; a
 * 422 refusal, a 429 or a 503 its own message. Anything else - a 401, a
 * 500, a body that is not the answer - is null: the page says SAVE_NOT_SAVED.
 */
export function refusedMessage(
  status: number,
  body: unknown,
  fieldErrors: z.ZodType<{
    readonly message: string;
    readonly errors: Partial<Record<string, string[]>>;
  }>,
): string | null {
  if (status === 422) {
    const fields = fieldErrors.safeParse(body);
    if (fields.success) {
      const first = Object.values(fields.data.errors)[0]?.[0];
      return first ?? fields.data.message;
    }
  }
  if (status === 422 || status === 429 || status === 503) {
    const refusal = refusalSchema.safeParse(body);
    if (refusal.success) return refusal.data.message;
  }
  return null;
}

/**
 * Posts a save's form as sportbet's pages do (asking for JSON) and reads
 * the answer with `read`; a body that is not JSON is read as null. A lost
 * connection is SAVE_NOT_SAVED.
 */
export async function postSave<Outcome>(
  path: string,
  body: URLSearchParams,
  read: (status: number, body: unknown) => Outcome,
): Promise<Outcome | NotSaved> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body,
    });
    const answer: unknown = await response.json().catch(() => null);
    return read(response.status, answer);
  } catch {
    return { kind: 'refused', message: SAVE_NOT_SAVED };
  }
}
