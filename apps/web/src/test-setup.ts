import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// The shell's links ask the router which page is current (nav-link.tsx).
// Every component test is on '/' unless it says otherwise with
// vi.mocked(usePathname).mockReturnValueOnce(...). A component that moves
// or refreshes the page gets a router of spies (vi.mocked(useRouter)).
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  })),
}));

afterEach(cleanup);
