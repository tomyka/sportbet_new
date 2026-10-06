import type { useRouter } from 'next/navigation';
import { vi } from 'vitest';

type Router = ReturnType<typeof useRouter>;

/** A router of spies for a component test (vi.mocked(useRouter)), with any of them given. */
export function routerSpies(given: Partial<Router> = {}): Router {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    bfcacheId: 'test',
    ...given,
  };
}
