import { z } from 'zod';
import { createDb } from '../client';
import { databaseUrlSchema } from '../config';
import { seedStaging } from '../seed/staging';

const env = z.object({ DATABASE_URL: databaseUrlSchema }).parse(process.env);
const { db, close } = createDb(env.DATABASE_URL);
try {
  await seedStaging(db);
  console.log('seed: staging tournaments present');
} finally {
  await close();
}
