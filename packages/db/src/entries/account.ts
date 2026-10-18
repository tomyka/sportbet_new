// Narrow entry `@sportbet/db/account` (#36): Accounts, sessions, sign-in codes, rate limits, profiles and reminders' setting.
// Holds only modules that never load the points schema (entry-points.test.ts).
export {
  findAccountByEmail,
  findPlayerEmail,
  listPlayerSettings,
  listPlayerTournaments,
  savePlayerSettings,
  setLastTournament,
  type Account,
} from '../account/repository';
export {
  createSession,
  deleteSession,
  findSignedInPlayer,
  recordLogin,
  touchSession,
  type SignedInPlayer,
} from '../account/sessions';
export {
  claimLoginCode,
  findLiveLoginCode,
  issueLoginCode,
  type LiveLoginCode,
  type NewLoginCode,
} from '../account/login-codes';
export {
  attemptRateLimit,
  pruneSignInState,
  type RateLimitAttempt,
  type RateLimitVerdict,
} from '../account/rate-limits';
export { isEmailRegistered, isUsernameHeld } from '../account/identity';
export {
  loadProfile,
  updateProfileNames,
  type Profile,
} from '../account/profile';
export { setReceiveReminders } from '../account/reminders';
export {
  cancelEmailChange,
  confirmEmailChange,
  requestEmailChange,
} from '../account/email-change';
export { restoreCreatedAt, type CreatedRow } from '../account/created-at';
export {
  changeRole,
  type RoleWrite,
  type RoleWriteRefusal,
} from '../account/role';
export { AccountBusyError } from '../account/busy';
export {
  findAccountByGoogleId,
  linkGoogleId,
  type GoogleLinkRefusal,
} from '../account/google';
