import { idFromText } from '@sportbet/domain';
import { formField } from '../request/form-input';
import { invalid, type AdminAnswer } from './admin-answer';

/** A posted id, or the answer that refuses it. */
export type PostedId =
  | { readonly ok: true; readonly id: number }
  | { readonly ok: false; readonly answer: AdminAnswer };

/**
 * A posted `field` that must name a row (`required|integer`), read only by
 * idFromText (sportbet issue 281: `userID[]=1` deleted user 1): blank is
 * `required`; a list, a cast, a float or junk is `not-an-integer`; both are
 * the form refused field by field, back to `back` with the 422 summary.
 */
export function readPostedId(
  form: FormData,
  field: string,
  back: string,
): PostedId {
  const posted = formField(form, field);
  if (posted === '') {
    return {
      ok: false,
      answer: invalid(back, [{ field, problem: 'required' }]),
    };
  }
  const id = typeof posted === 'string' ? idFromText(posted) : null;
  return id?.ok === true
    ? { ok: true, id: id.value }
    : {
        ok: false,
        answer: invalid(back, [{ field, problem: 'not-an-integer' }]),
      };
}
