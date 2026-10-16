import { formText } from '../request/form-input';

/**
 * Laravel's method spoofing: a POST's `_method` field, upper-cased, names
 * the method the form means (the danger zone's `@method('DELETE')`); none,
 * or a body that is no form, is POST. The request is cloned, so the real
 * handler still reads its body.
 */
export async function spoofedMethod(request: Request): Promise<string> {
  const form = await request
    .clone()
    .formData()
    .catch(() => new FormData());
  const named = formText(form, '_method').toUpperCase();
  return named === '' ? 'POST' : named;
}
