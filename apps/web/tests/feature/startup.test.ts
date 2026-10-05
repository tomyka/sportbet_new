import { expect, it } from 'vitest';
import { runServerUntilExit } from '../support/app';

it('refuses to start without DATABASE_URL, naming it', async () => {
  const { code, output } = await runServerUntilExit({});
  expect(code).toBe(1);
  expect(output).toContain('Invalid environment');
  expect(output).toContain('DATABASE_URL');
});

it('refuses to start with a DATABASE_URL that is not a Postgres URL', async () => {
  const { code, output } = await runServerUntilExit({
    DATABASE_URL: 'mysql://x@y/z',
  });
  expect(code).toBe(1);
  expect(output).toContain('DATABASE_URL');
});

it('refuses to start with an ADSENSE_CLIENT that is not a publisher id, naming it', async () => {
  const { code, output } = await runServerUntilExit({
    DATABASE_URL: 'postgres://sportbet@127.0.0.1:1/sportbet',
    ADSENSE_CLIENT: 'pub-7290396604686794',
  });
  expect(code).toBe(1);
  expect(output).toContain('Invalid environment');
  expect(output).toContain('ADSENSE_CLIENT');
});
