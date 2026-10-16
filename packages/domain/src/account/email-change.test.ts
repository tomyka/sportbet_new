import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing';
import { emailAddress } from './email';
import { AddressState } from './email-change';

const address = (typed: string) => unwrap(emailAddress(typed));
const CURRENT = address('old@example.lt');
const NEW = address('new@example.lt');
const OTHER = address('other@example.lt');

describe('AddressState.intent', () => {
  it('is unchanged for the current address with nothing pending', () => {
    expect(AddressState.of(CURRENT, null).intent(CURRENT)).toBe('unchanged');
  });

  it('drops a pending change when the current address is asked for', () => {
    expect(AddressState.of(CURRENT, NEW).intent(CURRENT)).toBe(
      'cancel-pending',
    );
  });

  it('asks for a change to any other address', () => {
    expect(AddressState.of(CURRENT, null).intent(NEW)).toEqual({ change: NEW });
  });

  it('asks again for the pending address: a fresh code is mailed', () => {
    expect(AddressState.of(CURRENT, NEW).intent(NEW)).toEqual({ change: NEW });
  });
});

describe('AddressState.confirm', () => {
  it('moves the account to the pending address and names the one it leaves', () => {
    expect(AddressState.of(CURRENT, NEW).confirm(NEW, false)).toEqual({
      ok: true,
      value: { old: CURRENT, now: NEW },
    });
  });

  it('is none when nothing waits', () => {
    expect(AddressState.of(CURRENT, null).confirm(NEW, false)).toEqual({
      ok: false,
      refusal: 'none',
    });
  });

  it('is none when the account waits for another address than the one confirmed', () => {
    expect(AddressState.of(CURRENT, OTHER).confirm(NEW, false)).toEqual({
      ok: false,
      refusal: 'none',
    });
  });

  it('is taken when another account holds the address, after none', () => {
    expect(AddressState.of(CURRENT, NEW).confirm(NEW, true)).toEqual({
      ok: false,
      refusal: 'taken',
    });
    expect(AddressState.of(CURRENT, null).confirm(NEW, true)).toEqual({
      ok: false,
      refusal: 'none',
    });
  });
});
