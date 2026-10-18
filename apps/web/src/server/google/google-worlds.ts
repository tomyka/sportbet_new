import { createAccount } from '@sportbet/db';
import {
  findAccountByEmail,
  findAccountByGoogleId,
  linkGoogleId,
  recordLogin,
} from '@sportbet/db/account';
import { ruledRules } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import { env } from '../../env';
import { googleEnv } from '../../google-env';
import { now } from '../clock';
import { cryptoDice } from '../dice';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { errorKind } from '../error-kind';
import { writeFlash } from '../flash';
import { logInfo } from '../log';
import { pointsChanged } from '../points-changed';
import { forgetIntended, readIntended } from '../register/intended';
import { registrationOpenAt } from '../register/registration-window';
import { seeOther } from '../request/route-responses';
import { currentPlayer, startSession } from '../session/session';
import { readReturn } from '../sign-in/return-path';
import { throttle } from '../sign-in/throttle';
import type { GoogleAnswer, GoogleWorld } from './complete';
import { clearPending, mintPending, readPending } from './pending';
import { chooseProvider } from './choose-provider';
import type { OAuthProvider } from './provider';
import type { StartWorld } from './start';

type Jar = Awaited<ReturnType<typeof cookies>>;

/** The provider the settings name, or null when Google is not configured (googleEnv has logged what by name). */
function providerOf(): OAuthProvider | null {
  const config = googleEnv();
  if (config === undefined) return null;
  return chooseProvider(config, {
    fetch: (url, init) => fetch(url, init),
    secret: env().AUTH_SECRET,
    now,
  });
}

/** The start's real world: the session, the settings, the throttle and the trip's cookie. */
export function startWorld(jar: Jar): StartWorld {
  const db = getDb();
  return {
    signedIn: async () => (await currentPlayer(db, jar, now())) !== null,
    provider: providerOf,
    throttle: (limits, at) => throttle(db, limits, at),
    mintTrip: (trip) => {
      mintPending(jar, trip, env().AUTH_SECRET, now());
    },
    log: (outcome) => {
      logInfo('google start', { outcome });
    },
  };
}

/** The callback's real world: the database, the provider, the cookies and the session. */
export function callbackWorld(jar: Jar): GoogleWorld {
  const db = getDb();
  const secret = env().AUTH_SECRET;
  return {
    throttle: (limits, at) => throttle(db, limits, at),
    trip: (at) => readPending(jar, secret, at),
    forgetTrip: () => {
      clearPending(jar);
    },
    exchange: async (exchange) => {
      const provider = providerOf();
      return provider === null
        ? { ok: false, refusal: 'failed' }
        : provider.exchange(exchange);
    },
    findBySub: (sub) => findAccountByGoogleId(db, sub),
    findByEmail: (email) => findAccountByEmail(db, email),
    registrationOpen: (at) => registrationOpenAt(at),
    link: (player, googleId) => linkGoogleId(db, { player, googleId }),
    register: (sub, email, name, at) =>
      createAccount(
        db,
        { google: { sub, email, name }, tournament: readIntended(jar) },
        { now: at, rules: ruledRules, dice: cryptoDice },
      ),
    signIn: async (player, method, at) => {
      // Read before the session starts, which forgets it.
      const back = method === 'google' ? readReturn(jar) : null;
      await startSession(db, jar, player, at);
      await recordLogin(db, { player, method, at });
      return back ?? PLAYER_HOME;
    },
    registered: () => {
      // The new account joined its tournament, its fill-ins scored.
      pointsChanged();
      forgetIntended(jar);
    },
    log: (outcome) => {
      logInfo('google sign-in', { outcome });
    },
    logError: (error) => {
      console.error(`google: a sign-in step failed (${errorKind(error)})`);
    },
  };
}

/** A real 303 with the one-time message, if any, never cached (the trip and the code are in these addresses). */
export function googleResponse(
  answer: GoogleAnswer,
  jar: Jar,
  at: ReturnType<typeof now>,
): Response {
  if (answer.flash !== null) {
    writeFlash(jar, answer.flash, at, env().AUTH_SECRET);
  }
  const response = seeOther(answer.to);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
