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
