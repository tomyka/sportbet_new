import { createDb } from '../client';
import { databaseEnvSchema } from '../config';
import { seedStaging } from '../seed/staging';

const env = databaseEnvSchema.parse(process.env);
const { db, close } = createDb(env.DATABASE_URL);
try {
  await seedStaging(db);
  console.log('seed: staging tournaments present');
} finally {
  await close();
}
