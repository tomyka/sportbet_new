/** The host an Origin header names, or null for an opaque or malformed one. */
function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Whether a state-changing request comes from this site (#16): its Origin
 * names this host - as Next and Vercel forward it (`x-forwarded-host`) or
 * as sent (`host`); with no Origin, its Sec-Fetch-Site says same-origin;
 * with neither, it does not. Next's own check on Server Actions lets a
 * request without an Origin through, so every action asks this as well.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get('origin');
  if (origin === null) return headers.get('sec-fetch-site') === 'same-origin';
  const host = hostOf(origin);
  if (host === null || host === '') return false;
  return [headers.get('x-forwarded-host'), headers.get('host')].some(
    (value) => value !== null && value.split(',')[0]?.trim() === host,
  );
}
