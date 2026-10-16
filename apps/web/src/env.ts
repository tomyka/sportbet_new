import { databaseEnvSchema, euroleagueFeedEnvSchema } from '@sportbet/db';
import {
  emailAddress,
  emailInvariant,
  type EmailAddress,
} from '@sportbet/domain';
import { z } from 'zod';

/**
 * AdSense's publisher id, set on production only (spec 4a, "Cookie consent
 * and ads"; production's is ca-pub-7290396604686794). Unset, "Sutinku" on
 * the cookie banner loads no ad: staging and every test run that way.
 */
const adsenseClientSchema = z
  .string()
  .regex(/^ca-pub-\d{16}$/, 'an AdSense publisher id: ca-pub- and 16 digits');

/**
 * The key that signs the pending sign-in cookie (server/sign-in/pending.ts):
 * at least 32 characters, per environment, never committed. The staging
 * deploy creates staging's (.github/workflows/ci.yml).
 */
const authSecretSchema = z.string().min(32, 'at least 32 characters');

/** A Resend API key. */
const resendKeySchema = z
  .string()
  .regex(/^re_[A-Za-z0-9_]+$/, 'a Resend API key: re_ and the key');

/** The sender's address, on the domain verified in Resend; the name is SportBet (server/mail/mail.ts). */
const mailFromSchema = emailInvariant.schema;

/** Staging's allow-list: one or more addresses, comma-separated, each normalized. */
const recipientsSchema = z
  .string()
  .transform((value, context): EmailAddress[] => {
    const addresses: EmailAddress[] = [];
    for (const part of value.split(',')) {
      const address = emailAddress(part);
      if (!address.ok) {
        context.addIssue({
          code: 'custom',
          message: 'one or more email addresses, comma-separated',
        });
        return z.NEVER;
      }
      addresses.push(address.value);
    }
    return addresses;
  });

/** Where the server runs; unset is a developer's machine. next.config.ts reads it too. */
const sportbetEnvSchema = z.enum(['local', 'ci', 'staging', 'production']);

/** The one transport each deployed environment may use (review W1). */
const REQUIRED_TRANSPORT = {
  staging: 'resend-allow-list',
  production: 'resend',
} as const;

const transportSchema = z.discriminatedUnion('MAIL_TRANSPORT', [
  z.object({
    MAIL_TRANSPORT: z.literal('mailpit'),
    MAILPIT_URL: z.url({ protocol: /^https?$/ }),
    MAIL_FROM_ADDRESS: mailFromSchema,
  }),
  z.object({
    MAIL_TRANSPORT: z.literal('resend'),
    RESEND_API_KEY: resendKeySchema,
    MAIL_FROM_ADDRESS: mailFromSchema,
  }),
  z.object({
    MAIL_TRANSPORT: z.literal('resend-allow-list'),
    RESEND_API_KEY: resendKeySchema,
    MAIL_FROM_ADDRESS: mailFromSchema,
    MAIL_ALLOWED_RECIPIENTS: recipientsSchema,
  }),
]);

/**
 * How mail leaves the app (decision 8 as amended, spec 4b): Mailpit's HTTP
 * API in CI's E2E stack and local runs, Resend to an allow-list on
 * staging, Resend on production - and SPORTBET_ENV holds each deployed
 * environment to its own, so staging can never mail a stranger and
 * production never mails into a Mailpit. A missing or bad setting stops
 * the server at start, never at the first sign-in.
 */
export const mailEnvSchema = z
  .object({ SPORTBET_ENV: sportbetEnvSchema.optional() })
  .and(transportSchema)
  .superRefine((value, context) => {
    const where = value.SPORTBET_ENV;
    if (where === 'staging' || where === 'production') {
      const required = REQUIRED_TRANSPORT[where];
      if (value.MAIL_TRANSPORT !== required) {
        context.addIssue({
          code: 'custom',
          path: ['MAIL_TRANSPORT'],
          message: `SPORTBET_ENV=${where} mails only through ${required}`,
        });
      }
    }
  });

export type MailEnv = z.infer<typeof mailEnvSchema>;

/**
 * The import's feed (slice 15). A deployed environment (staging or
 * production) may leave EUROLEAGUE_FEED out and reads the live feed; ci,
 * local and an unset environment must say which, so a forgotten setting
 * fails closed instead of reaching the live host. The db's schema then holds
 * each environment to the feed it may use.
 */
export const feedEnvSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null) return raw;
  // Each key is read one by one: Vercel's edge runtime hands over a
  // process.env whose prototype is not a plain object's, which `z.record`
  // refuses (the default never applied and staging answered 500 on every
  // request) while a property read works on any object.
  const read = (key: string): unknown => Reflect.get(raw, key);
  const where = read('SPORTBET_ENV');
  const deployed = where === 'staging' || where === 'production';
  const feed = read('EUROLEAGUE_FEED');
  return {
    SPORTBET_ENV: where,
    EUROLEAGUE_FEED: deployed && feed === undefined ? 'live' : feed,
    EUROLEAGUE_FEED_FIXTURE: read('EUROLEAGUE_FEED_FIXTURE'),
  };
}, euroleagueFeedEnvSchema);

/**
 * The bearer secret of the cron route (R-97): at least 32 characters, per
 * environment, never committed. Staging's is STAGING_CRON_SECRET, copied to
 * the Vercel project by the deploy job.
 */
const cronSecretSchema = z.string().min(32, 'at least 32 characters');

/** Why `value` is no site address, or null: an origin only, https, or http://localhost where nothing is deployed. */
function appUrlProblem(value: string, deployed: boolean): string | null {
  const url = URL.parse(value);
  if (url?.origin !== value) {
    return 'an origin: a scheme and a host, no path, query or credentials';
  }
  if (url.protocol === 'https:') return null;
  const local = url.protocol === 'http:' && url.hostname === 'localhost';
  return local && !deployed ? null : 'an https origin';
}

/**
 * The cron route's secret and the site's address, which the links in mail
 * need (R-97, R-98): both required wherever SPORTBET_ENV is set, optional on
 * a developer's machine. The keys are read one by one, as `feedEnvSchema`
 * does, since it runs in the proxy's edge runtime too.
 */
export const reminderEnvSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const read = (key: string): unknown => Reflect.get(raw, key);
    return {
      SPORTBET_ENV: read('SPORTBET_ENV'),
      CRON_SECRET: read('CRON_SECRET'),
      APP_URL: read('APP_URL'),
    };
  },
  z
    .object({
      SPORTBET_ENV: sportbetEnvSchema.optional(),
      CRON_SECRET: cronSecretSchema.optional(),
      APP_URL: z.string().optional(),
    })
    .superRefine((value, context) => {
      const where = value.SPORTBET_ENV;
      const required =
        where === undefined ? null : `required where SPORTBET_ENV=${where}`;
      const deployed = where === 'staging' || where === 'production';
      const problems = {
        CRON_SECRET: value.CRON_SECRET === undefined ? required : null,
        APP_URL:
          value.APP_URL === undefined
            ? required
            : appUrlProblem(value.APP_URL, deployed),
      };
      for (const [path, message] of Object.entries(problems)) {
        if (message !== null) {
          context.addIssue({ code: 'custom', path: [path], message });
        }
      }
    }),
);

const envSchema = databaseEnvSchema
  .extend({
    ADSENSE_CLIENT: adsenseClientSchema.optional(),
    AUTH_SECRET: authSecretSchema,
  })
  .and(mailEnvSchema)
  // Slice 15: which Euroleague feed the import reads, held to SPORTBET_ENV
  // like the mail transport; a bad setting stops the server at start.
  .and(feedEnvSchema)
  // Slice 16: the cron route's secret and the site's address.
  .and(reminderEnvSchema);

export type Env = z.infer<typeof envSchema>;

let parsed: Env | undefined;

/** The parsed environment. Throws a ZodError naming every bad variable. */
export function env(): Env {
  parsed ??= envSchema.parse(process.env);
  return parsed;
}
