import { z } from 'zod';
import { databaseUrlSchema } from '../config';
import { MIGRATIONS_FOLDER, runMigrations } from '../migrations';

const env = z.object({ DATABASE_URL: databaseUrlSchema }).parse(process.env);
await runMigrations(env.DATABASE_URL, MIGRATIONS_FOLDER);
console.log('migrations: applied');
