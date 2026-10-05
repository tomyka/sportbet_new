/**
 * The client's address, for the per-IP throttles: the first entry of
 * X-Forwarded-For. It is trusted only because what stands in front of the
 * app - Vercel on staging, our Caddy on Oracle (infra/edge/caddy, no
 * trusted_proxies, so it ignores what the client sent) - overwrites that
 * header with the address it saw, so a client cannot choose its own. Next fills
 * nothing in; with no proxy in front (a test, a local run) the header is
 * whatever the client sent, or absent.
 */
export function clientIp(headers: Headers): string {
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first === undefined || first === '' ? 'unknown' : first;
}
