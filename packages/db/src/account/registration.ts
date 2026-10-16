import {
  ok,
  refuse,
  tournamentToJoin,
  type FillInDice,
  type Instant,
  type PlayerId,
  type RegistrationAnswers,
  type Result,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { z } from 'zod';
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

/** The moment, the rule set and the dice the join is made with. */
export interface Registering {
  readonly now: Instant;
  readonly rules: RuleSet;
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
]);

async function accountTaken(
  db: Executor,
  account: NewAccount,
): Promise<boolean> {
  return (
    (await isEmailRegistered(db, account.email)) ||
    (await isUsernameHeld(db, account.username))
  );
}

/**
 * The new player and their settings (admin level 0, locale lt, no last
 * tournament): the player's id.
 */
async function insertPlayer(
  tx: Executor,
  account: NewAccount,
): Promise<PlayerId> {
  const [row] = idRows.parse(
    await tx
      .insert(players)
      .values({
        username: account.username,
        email: account.email,
        name: account.name,
        surname: account.surname,
      })
      .returning({ id: players.id }),
  );
  if (row === undefined) {
    throw new Error('createAccount: the insert returned no player');
  }
  await tx.insert(playerSettings).values({
    playerId: row.id,
    locale: 'lt',
    role: 'player',
    lastTournamentId: null,
  });
  return playerOf(row.id);
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
 */
export async function createAccount(
  db: Executor,
  account: NewAccount,
  registering: Registering,
): Promise<Result<CreatedAccount, 'taken'>> {
  const { now, rules, dice } = registering;
  try {
    return await db.transaction(
      async (tx): Promise<Result<CreatedAccount, 'taken'>> => {
        await takeRegistrationLock(tx);
        if (await accountTaken(tx, account)) return refuse('taken');
        const player = await insertPlayer(tx, account);
        const tournament = tournamentToJoin({
          intended: account.tournament,
          candidates: await loadJoinCandidates(tx),
          now,
          rules,
        });
        if (tournament !== null) {
          const joined = await registerForTournament(tx, {
            player,
            tournament,
            rules,
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
