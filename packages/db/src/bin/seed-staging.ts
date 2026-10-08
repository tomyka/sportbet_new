import { emailAddress } from '@sportbet/domain';
import { createDb } from '../client';
import { databaseEnvSchema } from '../config';
import { seedEnvironmentAllowed, seedStaging } from '../seed/staging';

// Never against production (a security review of slice 7): the seed makes
// its account a superadmin.
if (!seedEnvironmentAllowed(process.env['SPORTBET_ENV'])) {
  console.error('seed: refused - SPORTBET_ENV must be local, ci or staging');
  process.exit(1);
}

const env = databaseEnvSchema.parse(process.env);

// Read by hand, not through a schema: a refusal must never print the value.
const typed = process.env['STAGING_ACCOUNT_EMAIL'] ?? '';
const address = typed === '' ? null : emailAddress(typed);
if (address !== null && !address.ok) {
  console.error('seed: STAGING_ACCOUNT_EMAIL is not an email address');
  process.exit(1);
}

const { db, close } = createDb(env.DATABASE_URL);
try {
  await seedStaging(db, address === null ? null : address.value);
  process.stdout.write(
    address === null
      ? 'seed: staging tournaments present; no STAGING_ACCOUNT_EMAIL, so no staging account\n'
      : 'seed: staging tournaments and the staging account present\n',
  );
} finally {
  await close();
}
