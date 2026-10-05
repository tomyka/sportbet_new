import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA256 over the purpose and the body under AUTH_SECRET: a value
 * sealed for one cookie never opens as another's (plan 4c, decision 2).
 */
const signatureOf = (purpose: string, body: string, secret: string) =>
  createHmac('sha256', secret).update(`${purpose}.${body}`).digest('base64url');

/** A cookie value the server alone can make: the JSON, base64url, then its signature. */
export function seal(
  purpose: string,
  payload: unknown,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signatureOf(purpose, body, secret)}`;
}

/** The JSON a sealed value holds, or null for one missing, forged, or sealed for another purpose or key. */
export function unseal(
  purpose: string,
  value: string | undefined,
  secret: string,
): unknown {
  const [body, signature, ...rest] = value?.split('.') ?? [];
  if (body === undefined || signature === undefined || rest.length > 0) {
    return null;
  }
  const expected = Buffer.from(signatureOf(purpose, body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    );
    return parsed;
  } catch {
    return null;
  }
}
