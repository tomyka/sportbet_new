// The production-copy reader, run by hand on the owner's PC:
//   pnpm --filter @sportbet/migrate --silent start [--keep] [--json]
// It takes no database URL and reads no DATABASE_URL: its only target is the
// Postgres container it starts itself (spec 2.2).
import { parseArgs } from 'node:util';
import { findOciCli, ociFetcher } from '../fetch';
import { renderReport } from '../report';
import { runReader, RunResources } from '../run';

const { values } = parseArgs({
  options: {
    keep: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
  strict: true,
});

const resources = new RunResources();
const interrupted = (signal: NodeJS.Signals) => {
  process.stderr.write(
    `reader: ${signal}, deleting the dump and the containers\n`,
  );
  void resources.release().finally(() => process.exit(2));
};
process.once('SIGINT', interrupted);
process.once('SIGTERM', interrupted);

const cli = await findOciCli();
if (cli === undefined) {
  process.stderr.write(
    'reader: no OCI CLI found (OCI_CLI, oci on the PATH, or ~/bin/oci.exe)\n',
  );
  process.exit(2);
}

const { report, kept } = await runReader(
  { fetcher: ociFetcher(cli), keep: values.keep, now: () => new Date() },
  resources,
);
process.stdout.write(
  values.json ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report),
);

if (kept !== null) {
  process.removeAllListeners('SIGINT');
  process.stdout.write(
    `\nThe loaded Postgres is kept until you press Ctrl-C (ids, usernames, predictions and points; no email or name):\n${kept.url}\n`,
  );
  await new Promise<void>((resolve) => {
    process.once('SIGINT', () => {
      resolve();
    });
  });
  const left = await kept.stop();
  process.stdout.write(
    left.length === 0
      ? 'cleanup the Postgres container is deleted\n'
      : `cleanup ${String(left.length)} labelled container(s) remain\n`,
  );
  process.exit(left.length === 0 ? report.exitStatus : 2);
}
process.exit(report.exitStatus);
