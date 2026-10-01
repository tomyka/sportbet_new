// The production-copy reader, run by hand on the owner's PC (README.md):
//   pnpm --filter @sportbet/migrate build
//   node tools/migrate/dist/migrate.mjs [--keep] [--json] [--parity --sportbet-tag <commit>]
// Run directly with node, not through pnpm, so Ctrl-C reaches the reader
// itself on Windows. It takes no database URL and reads no DATABASE_URL:
// its only target is the Postgres container it starts itself (spec 2.2).
import { parseArgs } from 'node:util';
import { removeRunContainers, removeRunNetworks } from '../containers';
import { findOciCli, ociFetcher } from '../fetch';
import { renderReport } from '../report';
import { runReader, RunResources } from '../run';
import { parityOptionOf } from '../sportbet-app';

const { values } = parseArgs({
  options: {
    keep: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    parity: { type: 'boolean', default: false },
    'sportbet-tag': { type: 'string' },
  },
  strict: true,
});

/** Resolves once `text` is handed to the OS, so a piped report is never cut short. */
const write = (stream: NodeJS.WriteStream, text: string) =>
  new Promise<void>((resolve) => {
    stream.write(text, () => {
      resolve();
    });
  });

/** Exits with `status` once stdout and stderr are flushed. */
async function exit(status: number): Promise<never> {
  process.exitCode = status;
  await Promise.all([write(process.stdout, ''), write(process.stderr, '')]);
  process.exit(status);
}

const resources = new RunResources();
let keeping: (() => void) | null = null;
let interrupts = 0;

/**
 * Deletes whatever is left and exits 2: a second signal, or a stuck
 * cleanup. Each removal is tried on its own, so a failing one never skips
 * the next; the network goes last, after the containers on it.
 */
function force(): void {
  const attempt = (removal: () => Promise<unknown>) =>
    removal().catch(() => undefined);
  void attempt(() => resources.release())
    .then(() => attempt(() => removeRunContainers(resources.id)))
    .then(() => attempt(() => removeRunNetworks(resources.id)))
    .finally(() => exit(2));
}

/**
 * Every way the reader can be told to stop - Ctrl-C (SIGINT), Ctrl-Break
 * (SIGBREAK), a closed console window (SIGHUP) or a kill (SIGTERM) -
 * interrupts the run: the download is killed and the dump and the run's
 * containers are deleted before the reader exits 2. While a
 * `--keep` Postgres waits, it ends the wait instead. A second signal, or
 * a cleanup still running after a minute, deletes what it can and exits.
 */
function interrupted(signal: NodeJS.Signals): void {
  if (keeping !== null) {
    keeping();
    return;
  }
  interrupts += 1;
  if (interrupts > 1) {
    force();
    return;
  }
  process.stderr.write(
    `reader: ${signal}, stopping; deleting the dump and the containers\n`,
  );
  void resources.cancel();
  setTimeout(force, 60_000).unref();
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
  process.on(signal, interrupted);
}

async function noOciCli(): Promise<never> {
  await write(
    process.stderr,
    'reader: no OCI CLI found (OCI_CLI, oci on the PATH, or ~/bin/oci.exe)\n',
  );
  return exit(2);
}
async function usage(message: string): Promise<never> {
  await write(process.stderr, `reader: ${message}\n`);
  return exit(2);
}
const option = parityOptionOf(values.parity, values['sportbet-tag']);
const parity = option.ok ? option.value : await usage(option.refusal);

const cli = (await findOciCli()) ?? (await noOciCli());

const { report, kept } = await runReader(
  {
    fetcher: ociFetcher(cli),
    keep: values.keep,
    now: () => new Date(),
    ...(parity === null ? {} : { parity }),
  },
  resources,
);
await write(
  process.stdout,
  values.json ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report),
);

if (kept !== null) {
  // The URL holds the container's password: stderr, never the report's stdout.
  const stopped = new Promise<void>((resolve) => {
    keeping = resolve;
  });
  await write(
    process.stderr,
    `\nThe loaded Postgres is kept until you press Ctrl-C (ids, usernames, predictions and points; no email or name):\n${kept.url}\n`,
  );
  await stopped;
  keeping = null;
  const left = await kept.stop();
  await write(
    process.stderr,
    left.length === 0
      ? 'cleanup the Postgres container is deleted\n'
      : `cleanup ${String(left.length)} labelled container(s) remain\n`,
  );
  await exit(left.length === 0 ? report.exitStatus : 2);
}
await exit(report.exitStatus);
