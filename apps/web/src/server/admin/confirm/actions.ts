import type {
  ConfirmableAction,
  Instant,
  PlayerId,
  Role,
} from '@sportbet/domain';
import type { AdminAnswer } from '../admin-answer';
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
  /** Does it: decided again under its own locks, answered as the page its writer belongs to. */
  readonly perform: (
    action: Extract<ConfirmableAction, { kind: K }>,
    at: Instant,
  ) => Promise<AdminAnswer>;
}

/**
 * Every kind registered once, with its permission, its description and its
 * performer. Slice 14 adds its kinds (`delete-user`, `change-role`,
 * `delete-league-message`) here, and the compiler asks for each.
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
    perform: (action, at) => performDeleteGame(action.game, at),
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

/** Does the action, which decides again under its own locks. */
export function performAction(
  action: ConfirmableAction,
  at: Instant,
): Promise<AdminAnswer> {
  return definitionFor(action.kind).perform(action, at);
}
