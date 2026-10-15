import {
  adminLeagueDetailsPath,
  adminLeaguePaymentsSavePath,
  ADMIN_LEAGUES_PATH,
} from '../admin/admin-paths';
import { LEAGUES_PATH } from '../shell/shell-paths';
import { leagueDetailsPath, leaguePaymentsSavePath } from './league-paths';

/** The addresses a payments page posts to and the way back from it: the league admin's own door, or the superadmin's (slice 14). */
export interface PaymentsPaths {
  /** Where a row posts itself (the autosave). */
  readonly save: string;
  /** Where the details form posts. */
  readonly details: string;
  readonly back: { readonly href: string; readonly label: string };
}

/** `/leagues/{league}/payments`: sportbet's. */
export const playerPaymentsPaths = (league: number): PaymentsPaths => ({
  save: leaguePaymentsSavePath(league),
  details: leagueDetailsPath(league),
  back: { href: LEAGUES_PATH, label: 'Lygos' },
});

/** `/admin/leagues/{league}/payments`: the superadmin's door, the public league's only one. */
export const adminPaymentsPaths = (league: number): PaymentsPaths => ({
  save: adminLeaguePaymentsSavePath(league),
  details: adminLeagueDetailsPath(league),
  back: { href: ADMIN_LEAGUES_PATH, label: 'Lygos' },
});
