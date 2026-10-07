import { throttledText } from '../sign-in/texts';

// Laravel's answers to a JSON request, as sportbet's pages read them,
// written once for every autosave (the prediction save, the result save);
// each save's protocol keeps its own field names, texts and schemas.

/** One field's message, under the field's posted name. */
export interface FieldMessage<Field extends string> {
  readonly field: Field;
  readonly message: string;
}

/**
 * A failed FormRequest's 422 body: `errors`, each field's messages under
 * its name, and `message`, the first of them - with "(and N more
 * error[s])" when there are more, in English as Laravel writes it
 * (sportbet translates no such line; its pages read `errors`).
 */
export function validationBody<Field extends string>(
  messages: readonly FieldMessage<Field>[],
): {
  readonly message: string;
  readonly errors: Partial<Record<Field, string[]>>;
} {
  const errors: Partial<Record<Field, string[]>> = {};
  for (const { field, message } of messages) {
    errors[field] = [...(errors[field] ?? []), message];
  }
  const first = messages[0]?.message ?? '';
  const more = messages.length - 1;
  return {
    message:
      more <= 0
        ? first
        : `${first} (and ${String(more)} more ${more === 1 ? 'error' : 'errors'})`,
    errors,
  };
}

/** A throttled request's 429 body: a refusal with the sign-in throttles' text. */
export function throttledBody(minutes: number): {
  readonly success: false;
  readonly message: string;
} {
  return { success: false, message: throttledText(minutes) };
}
