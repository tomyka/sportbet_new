// The league page's forms post to sportbet's URLs (routes/web.php:127-138)
// and the search reads one, each served by a route handler (slice 12b).

export { LEAGUE_SWITCH_PATH as LEAGUE_SWITCH } from '../shell/shell-paths';

export const LEAGUE_CREATE = '/leagues/create';
export const LEAGUE_UPDATE = '/leagues/update';
export const LEAGUE_INVITE = '/leagues/invite';
export const LEAGUE_ACCEPT = '/leagues/accept';
export const LEAGUE_DECLINE = '/leagues/decline';
export const LEAGUE_LEAVE = '/leagues/leave';
export const LEAGUE_DELETE = '/leagues/delete';
/** R-23: new; sportbet has no hand-over. */
export const LEAGUE_TRANSFER = '/leagues/transfer';
/** A GET answering JSON: `?leagueID=&query=`. */
export const LEAGUE_SEARCH = '/leagues/searchUsers';

/** The most the form's boxes take, as the domain checks it (R-121): the description's own 500, not sportbet's box of 255. */
export const NAME_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 500;

/** A league's payments page (sportbet's route 'leagues.payments', R-105): its admin's board and details form. */
export const leaguePaymentsPath = (league: number): string =>
  `/leagues/${String(league)}/payments`;

/**
 * Where a payments row posts itself. sportbet posts to the page's own
 * address; Next cannot serve a page and a handler at one path (slice 6,
 * decision 1).
 */
export const leaguePaymentsSavePath = (league: number): string =>
  `/leagues/${String(league)}/payments/save`;

/** Where the payment details form posts (sportbet's route 'leagues.payments.details'). */
export const leagueDetailsPath = (league: number): string =>
  `/leagues/${String(league)}/payment-details`;
