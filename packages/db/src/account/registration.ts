import {
  freeUsername,
  googleNameParts,
  googleUsernameBase,
  isUsernameTaken,
  ok,
  refuse,
  tournamentToJoin,
  type EmailAddress,
  type FillInDice,
  type GoogleId,
  type Instant,
  type PlayerId,
  type RegistrationAnswers,
  type Result,
  type Tournament,
} from '@sportbet/domain';
import { z } from 'zod';
import { findAccountByGoogleId } from './google';
import type { Executor } from '../client';
import { playerOf } from '../edge';
import {
  loadJoinCandidates,
  registerForTournament,
} from '../joining/repository';
import { players } from '../player/schema';
import { violatedUnique } from '../sql-state';
import {
  isEmailRegistered,
  heldUsernames,
  isUsernameHeld,
  takeRegistrationLock,
} from './identity';
import { playerSettings } from './schema';

const idRows = z.array(z.object({ id: z.int() }));

/** The answers a pending registration kept, and the slug it was given. */
export interface NewAccount extends RegistrationAnswers {
  /** The `?tournament=` slug /login or /register was given, if any. */
  readonly tournament: string | null;
}

/**
 * A Google sign-up (slice 19, #40): the verified identity, whose username is
 * derived under the registration lock (freeUsername) and whose name is split
 * from Google's. The address is exactly one Google called verified.
 */
export interface NewGoogleAccount {
  readonly google: {
    readonly sub: GoogleId;
    readonly email: EmailAddress;
    readonly name: string | null;
  };
  readonly tournament: string | null;
}

/** The moment and the dice the join is made with. */
export interface Registering {
  readonly now: Instant;
  readonly dice: FillInDice;
}

export interface CreatedAccount {
  readonly player: PlayerId;
  /** The tournament joined, or null when none took players. */
  readonly tournament: Tournament | null;
}

/** The constraints that mean a name is taken; any other is a failure (#270). */
const TAKEN = new Set([
  'players_username_unique',
  'players_email_folded_unique',
  'players_google_id_unique',
]);

/** The columns of a new player: from a form's answers, or derived from a Google identity. */
interface PlayerRow {
  readonly username: string;
  readonly email: EmailAddress;
  readonly name: string;
  readonly surname: string;
  readonly googleId: GoogleId | null;
}

/**
 * A Google sign-up's row, or null when the address (exactly, or as the
 * collation folds it) or the Google sub is already an account's (taken). The
 * username is the address's local part, suffixed 2, 3, ... until nobody holds
 * it as the collation compares it, derived here under the registration lock
 * (freeUsername); running out of suffixes is an impossible state and throws.
 */
async function googleRow(
  tx: Executor,
  account: NewGoogleAccount,
): Promise<PlayerRow | null> {
  const { sub, email, name } = account.google;
  if (
    (await isEmailRegistered(tx, email)) ||
    (await findAccountByGoogleId(tx, sub)) !== undefined
  ) {
    return null;
  }
  const held = await heldUsernames(tx);
  const username = freeUsername(googleUsernameBase(email), (candidate) =>
    isUsernameTaken(held, candidate),
  );
  if (!username.ok) {
    throw new Error('createAccount: no free username for a Google sign-up');
  }
  const [first, surname] = googleNameParts(name);
  return {
    username: username.value,
    email,
    name: first,
    surname,
    googleId: sub,
  };
}

/** The form door's row, or null when the address or the username is taken. */
async function formRow(
  tx: Executor,
  account: NewAccount,
): Promise<PlayerRow | null> {
  if (
    (await isEmailRegistered(tx, account.email)) ||
    (await isUsernameHeld(tx, account.username))
  ) {
    return null;
  }
  return {
    username: account.username,
    email: account.email,
    name: account.name,
    surname: account.surname,
    googleId: null,
  };
}

/**
 * The new player and their settings (admin level 0, locale lt, no last
 * tournament): the player's id.
 */
async function insertPlayer(tx: Executor, row: PlayerRow): Promise<PlayerId> {
  const [inserted] = idRows.parse(
    await tx.insert(players).values(row).returning({ id: players.id }),
  );
  if (inserted === undefined) {
    throw new Error('createAccount: the insert returned no player');
  }
  await tx.insert(playerSettings).values({
    playerId: inserted.id,
    locale: 'lt',
    role: 'player',
    lastTournamentId: null,
  });
  return playerOf(inserted.id);
}

/**
 * RegisteredUserController::createAccount and postRegisterActions, in one
 * transaction: taken (the address, or the username as sportbet's collation
 * compares it - isUsernameTaken) answers 'taken' and writes nothing; else the
 * player, their settings (admin level 0, locale lt, no last tournament),
 * and the tournament they join (tournamentToJoin: the intended one if it
 * takes players, else R-27's, else none) through registerForTournament.
 * An advisory lock makes two creations take turns, so the checks cannot
 * race; a unique violation on the username or the folded address is taken
 * all the same. Any other failure throws, and nothing is kept.
 *
 * The Google door (slice 19, #40) is the same transaction under the same
 * lock: the address is checked as for the form (a folded spelling is taken,
 * nobody is adopted), the Google sub too, and the username derived; a violation of
 * players_google_id_unique is taken as well. The account is created only
 * here, with its settings and its tournament.
 */
export async function createAccount(
  db: Executor,
  account: NewAccount | NewGoogleAccount,
  registering: Registering,
): Promise<Result<CreatedAccount, 'taken'>> {
  const { now, dice } = registering;
  try {
    return await db.transaction(
      async (tx): Promise<Result<CreatedAccount, 'taken'>> => {
        await takeRegistrationLock(tx);
        const row =
          'google' in account
            ? await googleRow(tx, account)
            : await formRow(tx, account);
        if (row === null) return refuse('taken');
        const player = await insertPlayer(tx, row);
        const tournament = tournamentToJoin({
          intended: account.tournament,
          candidates: await loadJoinCandidates(tx),
          now,
        });
        if (tournament !== null) {
          const joined = await registerForTournament(tx, {
            player,
            tournament,
            now,
            dice,
          });
          if (!joined.ok) {
            throw new Error(
              `createAccount: tournament ${String(tournament.id)}, chosen as open, refused the player`,
            );
          }
        }
        return ok({ player, tournament });
      },
    );
  } catch (error) {
    const constraint = violatedUnique(error);
    if (constraint !== null && TAKEN.has(constraint)) return refuse('taken');
    throw error;
  }
}
