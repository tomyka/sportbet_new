// The account area's public exports, re-exported by the package's index.
export {
  emailAddress,
  emailInvariant,
  foldEmail,
  normalizeEmail,
  storedEmailAddress,
  type EmailAddress,
} from './email';
export { ANSWER_MAX_LENGTH, personNameInvariant } from './person-name';
export { localeInvariant, type StoredPlayerSettings } from './player-settings';
export {
  adminLevelInvariant,
  isAdmin,
  isSuperadmin,
  mayEditMessages,
  mayEnterResults,
  mayEnterStandingsFacts,
  mayRecalculate,
  mayUnmarkFinalTable,
  ROLES,
  roleOfSportbetLevel,
  type Role,
} from './role';
export {
  codeStepCounters,
  LOGIN_CODE_DIGITS,
  LOGIN_CODE_PURPOSES,
  LOGIN_CODE_TTL_MINUTES,
  loginCodeExpiresAt,
  RESEND_COOLDOWN_SECONDS,
  type CodeStepCounters,
  type LoginCodePurpose,
} from './login-code';
export {
  AUDIT_LOGIN_METHODS,
  SESSION_LIFETIME_DAYS,
  sessionExpiresAt,
  utcDay,
  type AuditLoginMethod,
} from './session';
export {
  codeRequestLimits,
  codeVerifyLimits,
  registerConfirmLimits,
  registerPageLimits,
  registerRequestLimits,
  throttledMinutes,
  type ThrottleLimit,
} from './sign-in-throttle';
export {
  avatarInitials,
  displayInitials,
  displayName,
  type PersonName,
} from './display-name';
export {
  REGISTRATION_FIELDS,
  registrationAnswers,
  registrationProblems,
  type AnswerProblem,
  type RegistrationAnswers,
  type RegistrationField,
  type RegistrationProblems,
  type TypedRegistration,
} from './registration';
export { foldUsername, isUsernameTaken } from './username';
export {
  accountDeletion,
  adminHideChange,
  leagueHandOvers,
  type AccountDeletionRefusal,
  type DeletionActor,
  type LeagueHandOver,
  type OwnedLeague,
} from './account-deletion';
export {
  roleChange,
  roleChangeEntry,
  type RoleChange,
  type RoleChangeField,
  type RoleChangeFieldError,
  type RoleChangeFields,
  type RoleChangeFormCheck,
  type RoleChangeRefusal,
  type RoleHolder,
} from './role-change';
