import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { LOGIN_CODE_DIGITS } from '@sportbet/domain';

/** scrypt's cost for a code: 2^14, block size 8, no parallelism - about 25 ms and 16 MiB. */
export const SCRYPT_COST = { N: 16_384, r: 8, p: 1 } as const;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const FORMAT =
  /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

/**
 * scrypt of 'no-live-code' (not eight digits, so no typed code equals it)
 * at SCRYPT_COST, with a fixed salt: what verify compares against when no
 * live code exists, so both branches pay one full hash (#36 item 2). Its
 * cost is read from it like any stored hash's, so it cannot drift from
 * the real ones' (#37 item 1); code-hash.test.ts proves it is real.
 */
export const DUMMY_CODE_HASH =
  'scrypt$16384$8$1$c3BvcnRiZXQtZHVtbXktbA$1CRkN_CFAEcMv9zlMH216XOHwQmlt70RrkRqQkiTBTQ';

function derive(
  code: string,
  salt: Buffer,
  cost: { readonly N: number; readonly r: number; readonly p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, KEY_LENGTH, cost, (error, key) => {
      if (error === null) resolve(key);
      else reject(error);
    });
  });
}

/** A random code of LOGIN_CODE_DIGITS digits from a cryptographic source (sportbet's random_int). */
export function generateLoginCode(): string {
  return String(randomInt(0, 10 ** LOGIN_CODE_DIGITS)).padStart(
    LOGIN_CODE_DIGITS,
    '0',
  );
}

/** A code's stored form: `scrypt$N$r$p$salt$key`, the salt random per code. */
export async function hashLoginCode(code: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(code, salt, SCRYPT_COST);
  return [
    'scrypt',
    String(SCRYPT_COST.N),
    String(SCRYPT_COST.r),
    String(SCRYPT_COST.p),
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/**
 * Whether `code` is the code `stored` was made from: always one full
 * derivation at the stored hash's own cost, and a constant-time compare.
 * A stored value that is no scrypt hash is an impossible state: it throws.
 */
export async function loginCodeMatches(
  code: string,
  stored: string,
): Promise<boolean> {
  const [, n, r, p, salt, key] = FORMAT.exec(stored) ?? [];
  if (
    n === undefined ||
    r === undefined ||
    p === undefined ||
    salt === undefined ||
    key === undefined
  ) {
    throw new Error('login code hash: not a scrypt hash');
  }
  const expected = Buffer.from(key, 'base64url');
  const derived = await derive(code, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}
