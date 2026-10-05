import { databaseEnvSchema } from '@sportbet/db';
import { z } from 'zod';

/**
 * AdSense's publisher id, set on production only (spec 4a, "Cookie consent
 * and ads"; production's is ca-pub-7290396604686794). Unset, "Sutinku" on
 * the cookie banner loads no ad: staging and every test run that way.
 */
const adsenseClientSchema = z
  .string()
  .regex(/^ca-pub-\d{16}$/, 'an AdSense publisher id: ca-pub- and 16 digits');

const envSchema = databaseEnvSchema.extend({
  ADSENSE_CLIENT: adsenseClientSchema.optional(),
});

export type Env = z.infer<typeof envSchema>;

let parsed: Env | undefined;

/** The parsed environment. Throws a ZodError naming every bad variable. */
export function env(): Env {
  parsed ??= envSchema.parse(process.env);
  return parsed;
}
