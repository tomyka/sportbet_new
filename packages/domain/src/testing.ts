// Test-only entry point: tricky inputs shared between the domain schema
// tests and the database CHECK constraint tests, so both suites test the
// same edge cases. Never imported by runtime code (web or db); lint enforces
// that (eslint.config.js), and domain's own tests import these relatively
// instead of through this entry.
export {
  BLANK_NAMES,
  INVALID_SLUGS,
  VALID_SLUGS,
  jsWhitespaceCodePoints,
  type LabeledInput,
} from './tournament/tricky-inputs';
