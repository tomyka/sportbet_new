import { z } from 'zod';
import { appUrlProblem, sportbetEnvSchema } from './env';

const GOOGLE_PROVIDERS = ['live', 'fixture'] as const;

const keySchema = z.string().min(1).max(512);

interface Settings {
  readonly SPORTBET_ENV?: string | undefined;
  readonly GOOGLE_CLIENT_ID?: string | undefined;
  readonly GOOGLE_CLIENT_SECRET?: string | undefined;
  readonly GOOGLE_PROVIDER?: 'live' | 'fixture' | undefined;
  readonly APP_URL?: string | undefined;
}

const isDeployed = (where: string | undefined): boolean =>
  where === 'staging' || where === 'production';

/** What is wrong with the provider setting, by the rules above. */
function providerProblem(value: Settings): string | null {
  if (isDeployed(value.SPORTBET_ENV)) {
    return value.GOOGLE_PROVIDER === 'fixture'
      ? 'the fixture is refused where deployed'
      : null;
  }
  return value.GOOGLE_PROVIDER === undefined
    ? 'required: live or fixture'
    : null;
}

/** The address: required for the real Google, valid whenever it is given. */
function addressProblem(value: Settings, live: boolean): string | null {
  if (value.APP_URL === undefined) return live ? 'required' : null;
  return appUrlProblem(value.APP_URL, isDeployed(value.SPORTBET_ENV));
}

/** Every setting's problem, by name, or null. */
function problemsOf(value: Settings): Record<string, string | null> {
  const live =
    isDeployed(value.SPORTBET_ENV) || value.GOOGLE_PROVIDER === 'live';
  const missing = (key: string | undefined): string | null =>
    live && key === undefined ? 'required' : null;
  return {
    GOOGLE_PROVIDER: providerProblem(value),
    GOOGLE_CLIENT_ID: missing(value.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: missing(value.GOOGLE_CLIENT_SECRET),
    APP_URL: addressProblem(value, live),
  };
}

/**
 * Google sign-in's settings (slice 19, #40), read key by key like
 * `reminderEnvSchema` (a process.env is not always a plain object). Where
 * SPORTBET_ENV is staging or production the client id and secret are
 * required and the provider is `live`: `fixture` is refused there, since a
 * public fixture would let anyone sign in as anyone. In ci, local and an
 * unset environment GOOGLE_PROVIDER must say `live` or `fixture`, so a
 * forgotten setting fails closed; `live` then needs the id and secret, the
 * `fixture` neither. `live` needs APP_URL, the base of the redirect URI.
 */
const googleEnvSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const read = (key: string): unknown => Reflect.get(raw, key);
    return {
      SPORTBET_ENV: read('SPORTBET_ENV'),
      GOOGLE_CLIENT_ID: read('GOOGLE_CLIENT_ID'),
      GOOGLE_CLIENT_SECRET: read('GOOGLE_CLIENT_SECRET'),
      GOOGLE_PROVIDER: read('GOOGLE_PROVIDER'),
      APP_URL: read('APP_URL'),
    };
  },
  z
    .object({
      SPORTBET_ENV: sportbetEnvSchema.optional(),
      GOOGLE_CLIENT_ID: keySchema.optional(),
      GOOGLE_CLIENT_SECRET: keySchema.optional(),
      GOOGLE_PROVIDER: z.enum(GOOGLE_PROVIDERS).optional(),
      APP_URL: z.string().optional(),
    })
    .superRefine((value, context) => {
      for (const [path, message] of Object.entries(problemsOf(value))) {
        if (message !== null) {
          context.addIssue({ code: 'custom', path: [path], message });
        }
      }
    }),
);

/** The settings of a Google sign-in that can run: the real Google, or the fixture the tests and CI's E2E use. */
export type GoogleEnv =
  | {
      readonly provider: 'live';
      readonly clientId: string;
      readonly clientSecret: string;
      /** `APP_URL` + `/auth/google/callback`: never from the request's Host (spec 8). */
      readonly redirectUri: string;
    }
  | { readonly provider: 'fixture' };

/** The settings that passed: the fixture where nothing is deployed, else the real Google. */
function settingsOf(settings: Settings): GoogleEnv | undefined {
  if (
    !isDeployed(settings.SPORTBET_ENV) &&
    settings.GOOGLE_PROVIDER === 'fixture'
  ) {
    return { provider: 'fixture' };
  }
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL } = settings;
  if (
    GOOGLE_CLIENT_ID === undefined ||
    GOOGLE_CLIENT_SECRET === undefined ||
    APP_URL === undefined
  ) {
    return undefined;
  }
  return {
    provider: 'live',
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: `${APP_URL}/auth/google/callback`,
  };
}

/**
 * The settings, read lazily and only by the Google routes and the layout's
 * button: a missing or bad one is `undefined` (the button is not drawn, the
 * routes answer the failure message) and never stops a page or the proxy,
 * which a global schema would. The problem is logged by variable name, never
 * by value.
 */
export function googleEnv(
  source: object = process.env,
  options: { readonly log: boolean } = { log: true },
): GoogleEnv | undefined {
  const parsed = googleEnvSchema.safeParse(source);
  if (!parsed.success) {
    const names = parsed.error.issues.map(({ path }) => path.join('.'));
    if (options.log) {
      console.error(`google: not configured (${names.join(', ')})`);
    }
    return undefined;
  }
  return settingsOf(parsed.data);
}
