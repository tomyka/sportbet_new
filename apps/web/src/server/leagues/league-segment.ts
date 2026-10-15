import { idFromText } from '@sportbet/domain';

/**
 * The `{league}` of /leagues/{league}/...: read only by `idFromText`; a
 * segment that is no id names no league (a route segment, so a 404, not a
 * 422), as does an integer past Postgres' `integer`.
 */
export function readLeagueSegment(segment: string): number | null {
  const id = idFromText(segment);
  return id.ok ? id.value : null;
}
