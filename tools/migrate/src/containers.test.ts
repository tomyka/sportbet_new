import { GenericContainer, getContainerRuntimeClient } from 'testcontainers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrubbedLoadError, startSportbetApp } from './containers';
import { ReaderProblem } from './problem';

describe("the old app's image", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses an image not on this PC: no container is started and Docker is never asked to pull', async () => {
    const client = await getContainerRuntimeClient();
    // Stubbed, so not even a failing run of this test reaches a registry or
    // starts a container.
    const pull = vi
      .spyOn(client.image, 'pull')
      .mockRejectedValue(new Error('pull attempted'));
    const dockerPull = vi
      .spyOn(client.container.dockerode, 'pull')
      .mockRejectedValue(new Error('pull attempted'));
    const start = vi
      .spyOn(GenericContainer.prototype, 'start')
      .mockRejectedValue(new Error('start attempted'));
    const started = startSportbetApp(
      'probe',
      '0000000',
      'sportbet-migrate-probe',
      'unused',
    );
    await expect(started).rejects.toThrow(ReaderProblem);
    await expect(started).rejects.toThrow(
      "the image sportbet-app:0000000 is not on this PC: build it from sportbet's commit (README)",
    );
    expect(
      [pull, dockerPull, start].map((spy) => spy.mock.calls.length),
    ).toEqual([0, 0, 0]);
  });
});

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
