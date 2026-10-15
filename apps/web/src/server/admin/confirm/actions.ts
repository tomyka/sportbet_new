import type { ConfirmableAction, PlayerId, Role } from '@sportbet/domain';
import type { AdminAnswer } from '../admin-answer';
import {
  changeRoleMailText,
  changeRolePermission,
  changeRoleText,
  performChangeRole,
} from './change-role';
import {
  deleteLeagueMailText,
  deleteLeaguePermission,
  deleteLeagueText,
  performDeleteLeague,
} from './delete-league';
import {
  deleteMessagePermission,
  deleteMessageText,
  performDeleteMessage,
} from './delete-message';
import {
  deleteUserMailText,
  deleteUserPermission,
  deleteUserText,
  findUser,
  performDeleteUser,
} from './delete-user';
import type { Performer } from './performer';
import {
  deleteGameMailText,
  deleteGamePermission,
  deleteGameText,
  findListedGame,
  performDeleteGame,
} from './delete-game';

type Kind = ConfirmableAction['kind'];

/** What an action will do, in words: for the confirmation page, and for the mail (which carries only what this app wrote). */
export interface Described {
  readonly page: string;
  readonly mail: string;
}

/** One kind of destructive superadmin action the emailed confirmation covers (R-26 amended). */
interface ActionDefinition<K extends Kind> {
  /** The role that may ask for the action and confirm it. */
  readonly permission: (role: Role) => boolean;
  /** What the action will do, in words; null when what it names is not there for `player` to act on. */
  readonly describe: (
    action: Extract<ConfirmableAction, { kind: K }>,
    player: PlayerId,
  ) => Promise<Described | null>;
  /** What the confirmation page says when `describe` finds nothing (the target is gone since the ask), or null to go to the dashboard. */
  readonly gone: string | null;
  /** Does it: decided again under its own locks, answered as the page its writer belongs to. */
  readonly perform: (
    action: Extract<ConfirmableAction, { kind: K }>,
    by: Performer,
  ) => Promise<AdminAnswer>;
}

/**
 * Every kind registered once, with its permission, its description and its
 * performer, and the compiler asks for each. Every kind is a superadmin's:
 * the cookie names the action and the code only the action it was mailed for
 * (`actionBinding`); the target is never read from a posted field here.
 */
const DEFINITIONS: { readonly [K in Kind]: ActionDefinition<K> } = {
  'delete-game': {
    permission: deleteGamePermission,
    describe: async (action, player) => {
      const game = await findListedGame(player, action.game);
      return game === null
        ? null
        : {
            page: deleteGameText(game),
            mail: deleteGameMailText(game.id),
          };
    },
    gone: null,
    perform: (action, by) => performDeleteGame(action.game, by),
  },
  'delete-user': {
    permission: deleteUserPermission,
    describe: async (action) => {
      const user = await findUser(action.player);
      return user === null
        ? null
        : {
            page: deleteUserText(user),
            mail: deleteUserMailText(user.id),
          };
    },
    gone: 'Paskyra nebeegzistuoja.',
    perform: (action, by) => performDeleteUser(action.player, by),
  },
  'change-role': {
    permission: changeRolePermission,
    describe: async (action) => {
      const user = await findUser(action.player);
      return user === null
        ? null
        : {
            page: changeRoleText(user.username, user.role, action.role),
            mail: changeRoleMailText(user.id, action.role),
          };
    },
    gone: 'Paskyra nebeegzistuoja.',
    perform: (action, by) => performChangeRole(action.player, action.role, by),
  },
  'delete-league-message': {
    permission: deleteMessagePermission,
    describe: async (action, player) => {
      const text = await deleteMessageText(player, action.message);
      return text === null ? null : { page: text, mail: text };
    },
    gone: 'Žinutės nebėra.',
    perform: (action, by) => performDeleteMessage(action.message, by),
  },
  'delete-league': {
    permission: deleteLeaguePermission,
    describe: async (action, player) => {
      const text = await deleteLeagueText(player, action.league);
      return text === null
        ? null
        : { page: text, mail: deleteLeagueMailText(action.league) };
    },
    gone: 'Lygos nebėra.',
    perform: (action, by) => performDeleteLeague(action.league, by),
  },
};

const definitionFor = <K extends Kind>(kind: K): ActionDefinition<K> =>
  DEFINITIONS[kind];

/** The role that may ask for the action and confirm it. */
export function permissionOf(
  action: ConfirmableAction,
): (role: Role) => boolean {
  return definitionFor(action.kind).permission;
}

/** What the action will do, in words; null when what it names is not there for `player`. */
export function describeAction(
  action: ConfirmableAction,
  player: PlayerId,
): Promise<Described | null> {
  return definitionFor(action.kind).describe(action, player);
}

/** What the confirmation page says when the action's target is gone, or null for the dashboard. */
export function goneText(action: ConfirmableAction): string | null {
  return definitionFor(action.kind).gone;
}

/** Does the action, which decides again under its own locks, for the admin and working tournament it is given. */
export function performAction(
  action: ConfirmableAction,
  by: Performer,
): Promise<AdminAnswer> {
  return definitionFor(action.kind).perform(action, by);
}
