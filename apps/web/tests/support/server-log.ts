import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) =>
  existsSync(path) ? readFileSync(path, 'utf8') : '';

/**
 * Marks the feature server's log (global-setup's serverLogPath) now, and
 * gives what it has printed since, once that includes `expected` - its
 * output reaches the file a moment after the response - or after 2 s.
 */
export function serverLogSince(
  path: string,
): (expected: string) => Promise<string> {
  const start = read(path).length;
  return async (expected) => {
    const deadline = Date.now() + 2000;
    for (;;) {
      const since = read(path).slice(start);
      if (since.includes(expected) || Date.now() > deadline) return since;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
}
