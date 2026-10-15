// Slice 15: no test reaches a host but this machine. The guard is the Vitest
// setup file every project lists (packages/domain/src/network-guard-setup.ts).

import { describe, expect, it } from 'vitest';

describe('the network guard', () => {
  it('refuses a remote host before any connection is made', async () => {
    await expect(fetch('https://guard-proof.invalid/')).rejects.toThrow(
      'network is closed in tests: guard-proof.invalid',
    );
  });

  it('lets a local host through to a real connection attempt, which fails on its own', async () => {
    const attempt = fetch('http://127.0.0.1:1/');
    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.not.toThrow('network is closed in tests');
  });
});
