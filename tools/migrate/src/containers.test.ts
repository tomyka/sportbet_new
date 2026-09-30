import { describe, expect, it } from 'vitest';
import { scrubbedLoadError } from './containers';

describe('a failed restore', () => {
  it("reports the mysql client's exit code and the dump line only, never its message", () => {
    const stderr =
      "ERROR 1064 (42000) at line 57: You have an error in your SQL syntax near 'Sentinel-Name-ada','sentinel.ada@example.invalid'";
    const reported = scrubbedLoadError(1, stderr);
    expect(reported).toBe('the mysql client exited with 1 at dump line 57');
    expect(reported).not.toContain('Sentinel');
  });

  it('reports the exit code alone when the client names no line', () => {
    expect(
      scrubbedLoadError(2, 'ERROR 2002 (HY000): Can not connect: sentinel'),
    ).toBe('the mysql client exited with 2');
  });
});
