import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// The shell's links ask the router which page is current (nav-link.tsx).
// Every component test is on '/' unless it says otherwise with
// vi.mocked(usePathname).mockReturnValueOnce(...).
vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/') }));

afterEach(cleanup);
