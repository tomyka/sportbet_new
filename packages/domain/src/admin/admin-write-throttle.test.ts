import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import { adminWriteLimits } from './admin-write-throttle';

describe('adminWriteLimits (slice 13)', () => {
  it('throttle: 60 accepted structure writes a minute per superadmin', () => {
    expect(adminWriteLimits(player('7'))).toEqual([
      { key: 'admin-write:player:7', maxAttempts: 60, windowSeconds: 60 },
    ]);
  });

  it('throttle: each account has its own window', () => {
    expect(adminWriteLimits(player('7'))[0]?.key).not.toBe(
      adminWriteLimits(player('8'))[0]?.key,
    );
  });
});
