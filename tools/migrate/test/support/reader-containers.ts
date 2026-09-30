// The reader's own containers, as its tests reach them. The reader starts
// and removes its MySQL and Postgres itself, as a real run does, so these
// tests cannot take their database from @sportbet/db/testing (CLAUDE.md
// names this exception): they connect to the Postgres a --keep run leaves,
// and stand in for the container a crashed run leaves behind.

import { createDb, type DbHandle } from '@sportbet/db';
import { POSTGRES_IMAGE } from '@sportbet/db/migrations';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { LABEL, PID_LABEL } from '../../src/containers';
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
