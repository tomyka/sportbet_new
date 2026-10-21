export const UNKNOWN_COMMIT = 'unknown';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

/**
 * The commit the image was built from (the Dockerfile's APP_COMMIT, passed by
 * CI as the commit sha). Anything but a full lower-case sha reads as unknown,
 * so the endpoint can never echo some other value from the environment.
 * The caller reads the one key itself, never the whole env (the edge-runtime
 * note in CLAUDE.md).
 */
export function appCommit(value: string | undefined): string {
  return value !== undefined && COMMIT_PATTERN.test(value)
    ? value
    : UNKNOWN_COMMIT;
}
