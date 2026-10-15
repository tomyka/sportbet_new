import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import { importPreviewLimits } from './import-throttle';

describe('importPreviewLimits (slice 15)', () => {
  it('throttle: 10 previews a minute per account', () => {
    expect(importPreviewLimits(player('7'))).toEqual([
      { key: 'import-preview:player:7', maxAttempts: 10, windowSeconds: 60 },
    ]);
  });

  it('throttle: each account has its own window', () => {
    expect(importPreviewLimits(player('7'))[0]?.key).not.toBe(
      importPreviewLimits(player('8'))[0]?.key,
    );
  });
});
