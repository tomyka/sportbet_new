import {
  leagueExists,
  loadPaymentsPage,
  saveDetails,
  savePayments,
} from '@sportbet/db';
import {
  isSuperadmin,
  refuse,
  ruledRules,
  type PaymentsPage,
} from '@sportbet/domain';
import { adminLeaguePaymentsPath } from '../../components/admin/admin-paths';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { asLeague } from '../leagues/id-field';
import type { DetailsWorld } from '../leagues/save-details';
import type { PaymentsWorld } from '../leagues/save-payments';
import { leagueWorld } from '../leagues/league-world';
import { readLeagueSegment } from '../leagues/league-segment';
import type { PaymentsDoor } from '../leagues/payments-door';
import { adminGate } from './gate';
import { workingTournament } from './working-tournament';

/**
 * The superadmin's door to a league's payments (sportbet's `admin.leagues.
 * payments`, slice 14): the public league's only one. A guest or any other
 * role goes home, as every admin route does (decision 2).
 */
export const ADMIN_PAYMENTS_DOOR: PaymentsDoor = {
  page: adminLeaguePaymentsPath,
  refusedAt: '/',
};

/** The league world with the gate of the door: only a superadmin is anyone here. */
const adminLeagueWorld = () => ({
  ...leagueWorld(),
  signedIn: () => adminGate(isSuperadmin),
  leagueExists: (league: Parameters<typeof leagueExists>[1]) =>
    leagueExists(getDb(), league),
});

/**
 * The world of the door's save: the writer is given the superadmin and the
 * one tournament they work on (a league of another is not there for them,
 * R-95), and decides again under its locks, reading the actor's role.
 */
export function adminPaymentsWorld(): PaymentsWorld {
  return {
    ...adminLeagueWorld(),
    save: async (save) => {
      const tournament = await workingTournament(save.actor);
      if (tournament === null) return refuse('no-such-league');
      return savePayments(getDb(), {
        ...save,
        actor: { superadmin: save.actor, tournament: tournament.id },
        rules: ruledRules,
      });
    },
  };
}

/** The world of the door's details form. */
export function adminDetailsWorld(): DetailsWorld {
  return {
    ...adminLeagueWorld(),
    save: async (save) => {
      const tournament = await workingTournament(save.actor);
      if (tournament === null) return refuse('no-such-league');
      return saveDetails(getDb(), {
        ...save,
        actor: { superadmin: save.actor, tournament: tournament.id },
      });
    },
  };
}

/** What the payments page of the door does: draw, answer 404, or go home. */
export type OpenedAdminPayments =
  | { readonly kind: 'page'; readonly page: PaymentsPage }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'home' };

/**
 * `/admin/leagues/{league}/payments` (LeaguePaymentController::adminEdit): a
 * superadmin only (anyone else goes home); a segment that is no id, no
 * working tournament, or a league of another tournament is a 404; else the
 * league's payments, the public league's included.
 */
export async function openAdminPayments(
  segment: string,
): Promise<OpenedAdminPayments> {
  const admin = await adminGate(isSuperadmin);
  if (admin === null) return { kind: 'home' };
  const id = readLeagueSegment(segment);
  const tournament = await workingTournament(admin.player);
  if (id === null || tournament === null) return { kind: 'not-found' };
  const loaded = await loadPaymentsPage(getDb(), {
    actor: { superadmin: admin.player, tournament: tournament.id },
    league: asLeague(id),
    rules: ruledRules,
  });
  if (loaded.ok) return { kind: 'page', page: loaded.value };
  return loaded.refusal === 'not-an-admin'
    ? { kind: 'home' }
    : { kind: 'not-found' };
}
