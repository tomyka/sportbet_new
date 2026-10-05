import { describe, expect, it } from 'vitest';
import { throttledText } from './texts';
import { hashKey } from './throttle';

// The limits themselves, IP first, are the domain's (sign-in-throttle.ts,
// tested there); what stays in web is the stored key and the answer.
describe('the sign-in throttles', () => {
  it('stores a key only as its SHA-256', () => {
    expect(hashKey('login-code-request:email:jonas@example.lt')).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("answers a refusal with sportbet's text and the minutes (bootstrap/app.php, #75)", () => {
    expect(throttledText(10)).toBe(
      'Per daug bandymų. Pabandykite dar kartą po 10 min.',
    );
  });
});
