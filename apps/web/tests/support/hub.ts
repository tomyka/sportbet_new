import {
  createSession,
  findTournamentBySlug,
  saveTournamentProfile,
  type Db,
} from '@sportbet/db';
import {
  utcDay,
  type Role,
  type StoredPlayer,
  type TournamentProfile,
} from '@sportbet/domain';
import { now } from '../../src/server/clock';
import {
  hashSessionToken,
  newSessionToken,
} from '../../src/server/session/session-token';
import { saveAccounts } from './accounts';
import { Browser } from './browser';

export const ACTIVE_PROFILE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: null,
  isPublic: true,
};

/** Sets the profile of the tournament stored at `slug`. */
export async function withProfile(
  db: Db,
  slug: string,
  profile: TournamentProfile,
): Promise<void> {
  const tournament = await findTournamentBySlug(db, slug);
  if (tournament === undefined) throw new Error(`no tournament ${slug}`);
  await saveTournamentProfile(db, tournament, profile);
}

/** A browser holding a live session for `account` (saved with its settings as `role`). */
export async function signedInBrowser(
  db: Db,
  baseUrl: string,
  account: StoredPlayer,
  role: Role = 'player',
  ip = '192.0.2.40',
): Promise<Browser> {
  await saveAccounts(db, [account], role);
  const token = newSessionToken();
  const began = now();
  await createSession(db, {
    player: account.id,
    tokenHash: hashSessionToken(token),
    now: began,
  });
  const browser = new Browser(baseUrl, ip);
  browser.setCookie('__Host-sb_session', `${token}.${utcDay(began)}`);
  return browser;
}
