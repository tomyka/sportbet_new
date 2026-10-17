import { playerOf } from '@sportbet/db/edge';
import {
  foldEmail,
  sportbetColumns,
  type StoredPlayer,
  type StoredPlayerSettings,
} from '@sportbet/domain';
import type { SportbetRow } from '../read-columns';
import {
  dependsOn,
  LOADED,
  refused,
  type Fate,
  type Ledger,
  type MapContext,
} from './ledger';

// The accounts: users (spec 4b's columns) and their user_settings (one global
// switch and the settings 4b reads).

export interface MappedUsers {
  readonly fates: Map<number, Fate>;
  readonly users: Map<number, StoredPlayer>;
}

/**
 * users: the id, the username and the account (spec 4b). Two users whose
 * addresses are equal once accents are dropped cannot both load:
 * players_email_folded_unique refuses the second, as sportbet's collation
 * would have. Neither is chosen over the other and neither address is
 * changed (spec 4b): both are refused.
 */
export function mapUsers(ctx: MapContext): MappedUsers {
  const { ledger } = ctx;
  const fates = new Map<number, Fate>();
  const users = new Map<number, StoredPlayer>();
  for (const row of ctx.rows.users) {
    const mapped = sportbetColumns.player(row);
    if (mapped.ok) {
      users.set(row.id, mapped.value);
      fates.set(row.id, LOADED);
    } else {
      fates.set(row.id, refused(mapped.refusal));
      ledger.refuse('users', mapped.refusal);
    }
  }
  const byFolded = new Map<string, number[]>();
  for (const [id, player] of users) {
    const key = foldEmail(player.email);
    byFolded.set(key, [...(byFolded.get(key) ?? []), id]);
  }
  for (const ids of byFolded.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      users.delete(id);
      fates.set(id, refused('email-collision'));
      ledger.refuse('users', 'email-collision');
    }
  }
  return { fates, users };
}

export interface MappedSettings {
  /** Each user's one global switch (user_settings.active). */
  readonly active: Map<number, boolean>;
  /** Each user's reminder opt-in (user_settings.receive_reminders, R-97). */
  readonly receiveReminders: Map<number, boolean>;
  readonly settings: Map<number, StoredPlayerSettings>;
  /** Each user's rows, as read: counted once the players are known. */
  readonly rowsOf: Map<number, SportbetRow<'user_settings'>[]>;
  readonly fateOf: Map<number, 'kept' | 'duplicate' | 'refused'>;
}

/** What two rows of one user must agree on to count as one. */
const settingsKey = (row: SportbetRow<'user_settings'>): string =>
  `${String(row.active !== 0)}|${String(row.admin)}|${row.locale}|${String(row.receive_reminders !== 0)}`;

/** Refuses a user's settings rows, and the user with them if they loaded. */
function refuseSettings(
  refusal: {
    readonly ledger: Ledger;
    readonly users: MappedUsers;
    readonly settings: MappedSettings;
  },
  user: number,
  values: readonly unknown[],
  reason: string,
): void {
  const { ledger, users, settings } = refusal;
  values.forEach(() => {
    ledger.refuse('user_settings', reason);
  });
  if (users.fates.get(user)?.kind === 'loaded') {
    users.fates.set(user, refused(reason));
    users.users.delete(user);
    ledger.refuse('users', dependsOn(reason));
  }
  settings.fateOf.set(user, 'refused');
}

/** Each user's settings rows, as read. */
function settingsRowsByUser(
  ctx: MapContext,
): Map<number, SportbetRow<'user_settings'>[]> {
  const rowsOf = new Map<number, SportbetRow<'user_settings'>[]>();
  for (const row of ctx.rows.user_settings) {
    rowsOf.set(row.user_id, [...(rowsOf.get(row.user_id) ?? []), row]);
  }
  return rowsOf;
}

/**
 * user_settings: one global switch per user, and the settings 4b reads. A
 * user's rows that differ are refused, and the user with them; a user with
 * no row is refused too, as whether they are switched off cannot be read
 * (not guessed active).
 */
export function mapSettings(
  ctx: MapContext,
  users: MappedUsers,
): MappedSettings {
  const { ledger } = ctx;
  const settings: MappedSettings = {
    active: new Map(),
    receiveReminders: new Map(),
    settings: new Map(),
    rowsOf: settingsRowsByUser(ctx),
    fateOf: new Map(),
  };
  const refusal = { ledger, users, settings };
  for (const [user, values] of settings.rowsOf) {
    if (users.fates.get(user) === undefined) {
      values.forEach(() => {
        ledger.refuse('user_settings', 'orphan');
      });
      continue;
    }
    const [first] = values;
    if (first === undefined) continue;
    if (new Set(values.map(settingsKey)).size > 1) {
      refuseSettings(refusal, user, values, 'duplicate-key');
      continue;
    }
    const mapped = sportbetColumns.settings({
      player: playerOf(user),
      admin: first.admin,
      locale: first.locale,
    });
    if (!mapped.ok) {
      refuseSettings(refusal, user, values, mapped.refusal);
      continue;
    }
    settings.active.set(user, first.active !== 0);
    settings.receiveReminders.set(user, first.receive_reminders !== 0);
    settings.settings.set(user, mapped.value);
    settings.fateOf.set(user, values.length > 1 ? 'duplicate' : 'kept');
  }
  for (const [user, fate] of users.fates) {
    if (fate.kind === 'loaded' && !settings.active.has(user)) {
      users.fates.set(user, refused('player-without-settings'));
      users.users.delete(user);
      ledger.refuse('users', 'player-without-settings');
    }
  }
  return settings;
}
