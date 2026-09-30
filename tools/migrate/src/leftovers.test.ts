import { describe, expect, it } from 'vitest';
import { abandoned } from './containers';
import { abandonedWorkspace } from './run';

// What a run's preflight removes as a crashed run's leftovers: only what a
// process no longer running made, so a run in another terminal - or its
// --keep Postgres - is never destroyed.
const alive = (pid: number) => pid === 4242;

describe("a crashed run's leftover containers", () => {
  it("are those whose process is gone, or that name none; a live run's are kept", () => {
    expect(
      abandoned(
        [
          { id: 'live', run: 'a1', pid: 4242 },
          { id: 'crashed', run: 'b2', pid: 1717 },
          { id: 'unnamed', run: 'c3', pid: null },
        ],
        alive,
      ).map(({ id }) => id),
    ).toEqual(['crashed', 'unnamed']);
  });
});

describe("a crashed run's leftover temporary directories", () => {
  it("are those whose process is gone, or that name none; a live run's is kept", () => {
    expect(abandonedWorkspace('sportbet-migrate-4242-Ab12Cd', alive)).toBe(
      false,
    );
    expect(abandonedWorkspace('sportbet-migrate-1717-Ab12Cd', alive)).toBe(
      true,
    );
    expect(abandonedWorkspace('sportbet-migrate-Ab12Cd', alive)).toBe(true);
  });

  it("are never anything but the reader's own directories", () => {
    expect(abandonedWorkspace('sportbet-fetch-test-Ab12Cd', alive)).toBe(false);
    expect(abandonedWorkspace('other', alive)).toBe(false);
  });
});
