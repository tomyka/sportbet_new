import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing';
import { emailAddress } from './email';
import { emailChangeIntent } from './email-change';

const address = (typed: string) => unwrap(emailAddress(typed));
const CURRENT = address('old@example.lt');
const NEW = address('new@example.lt');

describe('emailChangeIntent', () => {
  it('is unchanged for the current address with nothing pending', () => {
    expect(emailChangeIntent(CURRENT, null, CURRENT)).toBe('unchanged');
  });

  it('drops a pending change when the current address is asked for', () => {
    expect(emailChangeIntent(CURRENT, NEW, CURRENT)).toBe('cancel-pending');
  });

  it('asks for a change to any other address', () => {
    expect(emailChangeIntent(CURRENT, null, NEW)).toEqual({ change: NEW });
  });

  it('asks again for the pending address: a fresh code is mailed', () => {
    expect(emailChangeIntent(CURRENT, NEW, NEW)).toEqual({ change: NEW });
  });
});
