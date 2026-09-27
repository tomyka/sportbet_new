import { databaseUrlSchema } from '@sportbet/db';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
});

export type Env = z.infer<typeof envSchema>;

let parsed: Env | undefined;

/** The parsed environment. Throws a ZodError naming every bad variable. */
export function env(): Env {
  parsed ??= envSchema.parse(process.env);
  return parsed;
}
