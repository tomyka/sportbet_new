/**
 * What a domain factory or method returns when the input may be refused
 * (spec: error handling). A refusal is a value the caller must handle, never
 * an exception; an impossible state (a programmer error) throws instead.
 */
export type Result<T, R extends string> = Accepted<T> | Refused<R>;

export interface Accepted<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Refused<R extends string> {
  readonly ok: false;
  readonly refusal: R;
}

export function ok<T>(value: T): Accepted<T> {
  return { ok: true, value };
}

export function refuse<R extends string>(refusal: R): Refused<R> {
  return { ok: false, refusal };
}

/**
 * A Result whose refusal carries what it is about (a game number, a team
 * name) beside its `kind`; the plain `Result` holds only a name.
 */
export type DetailedResult<T, R extends { readonly kind: string }> =
  Accepted<T> | { readonly ok: false; readonly refusal: R };

export function refuseWith<R extends { readonly kind: string }>(
  refusal: R,
): { readonly ok: false; readonly refusal: R } {
  return { ok: false, refusal };
}
