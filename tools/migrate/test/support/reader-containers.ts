// The reader's own containers, as its tests reach them. The reader starts
// and removes its MySQL and Postgres itself, as a real run does, so these
// tests cannot take their database from @sportbet/db/testing (CLAUDE.md
// names this exception): they connect to the Postgres a --keep run leaves,
// stand in for the container a crashed run leaves behind, and run a probe
// in sportbet's app on the reader's internal network or, as its control,
// an ordinary one.

import { createDb, type DbHandle } from '@sportbet/db';
import { POSTGRES_IMAGE } from '@sportbet/db/migrations';
import {
  GenericContainer,
  getContainerRuntimeClient,
  type StartedTestContainer,
} from 'testcontainers';
import {
  LABEL,
  PID_LABEL,
  removeRunNetworks,
  runInSportbetApp,
  startNetwork,
  startSportbetApp,
  stopSportbetApp,
  type ExecOutput,
} from '../../src/containers';
import type { KeptDatabase } from '../../src/run';

/** A connection to the Postgres a `--keep` run left running. */
export const connectKept = (kept: KeptDatabase): DbHandle => createDb(kept.url);

/**
 * A labelled container as a run of process `pid` would leave it: an idle
 * Postgres image, holding no data. The caller removes it.
 */
export const leftoverContainer = (pid: number): Promise<StartedTestContainer> =>
  new GenericContainer(POSTGRES_IMAGE)
    .withEntrypoint(['sleep'])
    .withCommand(['infinity'])
    .withLabels({
      [LABEL]: `run-of-${String(pid)}`,
      [PID_LABEL]: String(pid),
    })
    .start();

/**
 * The sportbet commit whose image the parity tests run: 1ac955f, where
 * golden-points.json - which the synthetic dump's production rows are -
 * was made. The image must be on this PC (README: building it). CI builds
 * it at the same commit (.github/workflows/ci.yml): change both together.
 */
export const SPORTBET_TEST_TAG = '1ac955f';

/**
 * An ordinary network (not internal: it has a route out of this PC), as
 * the control of the no-route-out test, labelled for run `run` of this
 * process so removeRunNetworks and the cleanup checks find it. Its name.
 */
async function ordinaryNetwork(run: string): Promise<string> {
  const client = await getContainerRuntimeClient();
  const name = `${LABEL}-${run}`;
  await client.container.dockerode.createNetwork({
    Name: name,
    Internal: false,
    Labels: { [LABEL]: run, [PID_LABEL]: String(process.pid) },
  });
  return name;
}

/**
 * Runs `script` with tinker in sportbet's app at SPORTBET_TEST_TAG, on a
 * network of its own run: the reader's internal one (startNetwork), or an
 * ordinary one with a route out, the control. No MySQL: the script needs
 * none. The app is stopped and the network removed whatever happens.
 */
export async function probeFromSportbetApp(
  script: string,
  network: 'internal' | 'ordinary',
): Promise<ExecOutput> {
  const run = `probe-${network}-${String(process.pid)}`;
  try {
    const name =
      network === 'internal'
        ? await startNetwork(run)
        : await ordinaryNetwork(run);
    const app = await startSportbetApp(run, SPORTBET_TEST_TAG, name, 'unused');
    try {
      return await runInSportbetApp(app, script);
    } finally {
      await stopSportbetApp(app);
    }
  } finally {
    await removeRunNetworks(run);
  }
}
