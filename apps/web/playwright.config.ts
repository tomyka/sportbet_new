import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['E2E_BASE_URL'];
if (baseURL === undefined || baseURL === '') {
  throw new Error(
    'E2E_BASE_URL is required: the E2E suite runs against a running stack.',
  );
}

// The sign-in journey reads its code from Mailpit, which only CI's stack
// runs; against staging (Resend, allow-listed to the owner) it is left out
// here rather than skipped in the spec.
const mailpit = process.env['E2E_MAILPIT_URL'];
const signInJourney =
  mailpit === undefined || mailpit === '' ? ['**/sign-in.spec.ts'] : [];

export default defineConfig({
  testDir: './e2e',
  testIgnore: signInJourney,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
