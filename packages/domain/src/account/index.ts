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
  mayEnterResults,
  mayRecalculate,
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
export { displayInitials, displayName, type PersonName } from './display-name';
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
