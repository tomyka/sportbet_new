import { createDb } from '../client';
import { databaseClock } from '../clock';
import { databaseEnvSchema } from '../config';
import { runEuroleagueImportCommand } from '../import/command';
import { euroleagueFeedEnvSchema, euroleagueFeedOf } from '../import/feed';

// The shell side of /admin/import: the same plan and apply, from the migrate
// image (docker compose run --rm migrate node dist/euroleague-import.mjs
// <tournament> [--season E2026] [--dry-run]). It reads DATABASE_URL and the
// feed's settings and nothing else; it cannot clear Next's leaderboard cache,
// which catches up within its minute.
const env = databaseEnvSchema.parse(process.env);
const feed = euroleagueFeedOf(euroleagueFeedEnvSchema.parse(process.env));

const { db, close } = createDb(env.DATABASE_URL);
try {
  process.exitCode = await runEuroleagueImportCommand(process.argv.slice(2), {
    db,
    feed,
    now: await databaseClock(db),
    out: (line) => process.stdout.write(`${line}\n`),
  });
} finally {
  await close();
}
