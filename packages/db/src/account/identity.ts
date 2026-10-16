import {
  isUsernameTaken,
  usernameInvariant,
  type EmailAddress,
  type PlayerId,
} from '@sportbet/domain';
import { and, eq, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { players } from '../player/schema';

/**
 * An identity - a username, an address - is claimed under one lock: a
 * registration, a rename and an address move take turns, so none can slip a
 * name or address past another's check. The key and the SQL are only here;
 * createAccount, updateProfileNames and confirmEmailChange call it first in
 * their transaction.
 */
export const takeRegistrationLock = (tx: Executor): Promise<unknown> =>
  tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('registration', 0))`,
  );

const idRows = z.array(z.object({ id: z.int() }));
const usernameRows = z.array(z.object({ username: usernameInvariant.schema }));

/**
 * Whether an account holds this address (step one's `unique:users`, step
 * two's `orWhere('email', ...)`): the same address, or a second spelling
 * that folds like it as utf8mb4_unicode_ci folds it. A uniqueness check,
 * never a lookup - sign-in finds an account by the exact address only
 * (findAccountByEmail) - and asked of the rows, not left to the unique
 * index, whose fold is close to the collation's but not the same (#16).
 * `except` leaves one account out: its own address is no collision when it
 * confirms a change (confirmEmailChange).
 */
export async function isEmailRegistered(
  db: Executor,
  email: EmailAddress,
  except?: PlayerId,
): Promise<boolean> {
  const rows = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        except === undefined
          ? undefined
          : ne(players.id, keyOf(except, 'player')),
        or(
          eq(players.email, email),
          sql`email_fold(${players.email}) = email_fold(${email})`,
        ),
      ),
    )
    .limit(1);
  return idRows.parse(rows).length > 0;
}

/**
 * Whether another account holds this username as sportbet's collation
 * compares it (isUsernameTaken, the one fold: the unique index is exact and
 * no SQL function of the database matches foldUsername's ignorable
 * characters and trailing spaces, so the rows are compared in the domain,
 * as registration always has). `except` leaves one account out.
 */
export async function isUsernameHeld(
  db: Executor,
  username: string,
  except?: PlayerId,
): Promise<boolean> {
  const rows = usernameRows.parse(
    await db
      .select({ username: players.username })
      .from(players)
      .where(
        except === undefined
          ? undefined
          : ne(players.id, keyOf(except, 'player')),
      ),
  );
  return isUsernameTaken(
    rows.map((row) => row.username),
    username,
  );
}
