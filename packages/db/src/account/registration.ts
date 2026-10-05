import {
  isUsernameTaken,
  ok,
  refuse,
  tournamentToJoin,
  usernameInvariant,
  type EmailAddress,
  type FillInDice,
  type Instant,
  type PlayerId,
  type RegistrationAnswers,
  type Result,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { playerOf } from '../edge';
import {
  loadJoinCandidates,
  registerForTournament,
} from '../joining/repository';
import { players } from '../player/schema';
import { violatedUnique } from '../sql-state';
import { playerSettings } from './schema';

const idRows = z.array(z.object({ id: z.int() }));
const usernameRows = z.array(z.object({ username: usernameInvariant.schema }));

/**
 * Whether an account holds this address (step one's `unique:users`, step
 * two's `orWhere('email', ...)`): the same address, or a second spelling
 * that folds like it as utf8mb4_unicode_ci folds it. A uniqueness check,
 * never a lookup - sign-in finds an account by the exact address only
 * (findAccountByEmail) - and asked of the rows, not left to the unique
 * index, whose fold is close to the collation's but not the same (#16).
 */
export async function isEmailRegistered(
  db: Executor,
  email: EmailAddress,
): Promise<boolean> {
  const rows = await db
    .select({ id: players.id })
    .from(players)
    .where(
      or(
        eq(players.email, email),
        sql`email_fold(${players.email}) = email_fold(${email})`,
      ),
    )
    .limit(1);
  return idRows.parse(rows).length > 0;
}

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
  if (await isEmailRegistered(db, account.email)) return true;
  const rows = usernameRows.parse(
    await db.select({ username: players.username }).from(players),
  );
  return isUsernameTaken(
    rows.map(({ username }) => username),
    account.username,
  );
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
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('registration', 0))`,
        );
        if (await accountTaken(tx, account)) return refuse('taken');
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
        const player = playerOf(row.id);
        await tx.insert(playerSettings).values({
          playerId: row.id,
          locale: 'lt',
          adminLevel: 0,
          lastTournamentId: null,
        });
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
