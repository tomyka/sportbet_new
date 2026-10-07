import { savePlayers, savePlayerSettings, type Db } from '@sportbet/db';
import { emailAddress, type StoredPlayer, type Role } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';

export const JONAS_EMAIL = 'jonas.petraitis@example.lt';
export const ZUKAUSKAS_EMAIL = 'žukauskas@example.lt';

export const JONAS_ACCOUNT: StoredPlayer = {
  id: player('1'),
  username: 'jonas',
  email: unwrap(emailAddress(JONAS_EMAIL)),
  name: 'Jonas',
  surname: 'Petraitis',
};

export const ZUKAUSKAS_ACCOUNT: StoredPlayer = {
  id: player('2'),
  username: 'zuk',
  email: unwrap(emailAddress(ZUKAUSKAS_EMAIL)),
  name: 'Žilvinas',
  surname: 'Žukauskas',
};

/** Saves the accounts with their settings at `role`, as every account has (sessions.ts). */
export async function saveAccounts(
  db: Db,
  accounts: readonly StoredPlayer[],
  role: Role = 'player',
): Promise<void> {
  await savePlayers(db, accounts);
  await savePlayerSettings(
    db,
    accounts.map((account) => ({
      player: account.id,
      locale: 'lt',
      role,
      lastTournament: null,
    })),
  );
}
