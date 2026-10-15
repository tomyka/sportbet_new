import { leaguePaymentsPath } from '../../components/leagues/league-paths';

/**
 * Which door a payments handler answers for: the league admin's own
 * (`/leagues/{league}/payments`, a guest sent to sign in) or the superadmin's
 * (`/admin/leagues/{league}/payments`, slice 14: anyone but a superadmin goes
 * home). The page the save and the details form come back to, and where a
 * refused caller goes.
 */
export interface PaymentsDoor {
  readonly page: (league: number) => string;
  /** Where a guest, or a role the door refuses, goes; sign-in when absent. */
  readonly refusedAt?: string;
}

/** The league admin's own door, sportbet's. */
export const PLAYER_PAYMENTS_DOOR: PaymentsDoor = { page: leaguePaymentsPath };
