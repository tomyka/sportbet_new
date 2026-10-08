import { afterEach, describe, expect, it, vi } from 'vitest';
import { logInfo } from './log';

// The server's one channel for operational information (#25): a JSON
// line per event on stdout, read by the host's log drain.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logInfo', () => {
  it('writes one JSON line: the event, then its fields', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    logInfo('recalculateAll', { tournament: 'euroleague-2026-27', ms: 42 });
    expect(write).toHaveBeenCalledOnce();
    const [line] = write.mock.calls[0] ?? [];
    expect(line).toBe(
      '{"event":"recalculateAll","tournament":"euroleague-2026-27","ms":42}\n',
    );
  });

  it('a field never overwrites the event', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    logInfo('recalculateAll', { event: 'other' });
    const [line] = write.mock.calls[0] ?? [];
    expect(JSON.parse(String(line))).toEqual({ event: 'recalculateAll' });
  });
});
