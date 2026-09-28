import { databaseEnvSchema } from '@sportbet/db';
import type { z } from 'zod';

// Web may extend this with its own variables later; for now it needs
// nothing beyond what every database-talking process needs.
const envSchema = databaseEnvSchema;

export type Env = z.infer<typeof envSchema>;

let parsed: Env | undefined;

/** The parsed environment. Throws a ZodError naming every bad variable. */
export function env(): Env {
  parsed ??= envSchema.parse(process.env);
  return parsed;
}
