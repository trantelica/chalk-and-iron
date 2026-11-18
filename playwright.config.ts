import { defineConfig, devices } from '@playwright/test';

// Browser tests of the passkey steps, against the built app and Supabase's
// own local version, in GitHub's test runs (approved by Nathan, 17 Nov 2026).
// The test browser's built-in stand-in passkey plays the part of Face ID.
// What only a real iPhone can show stays on the checklist in docs/SETUP.md.
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://localhost:3000', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npx next start -p 3000',
    url: 'http://localhost:3000/signin',
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_TEST_URL ?? '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? '',
      SUPABASE_SECRET_KEY: process.env.SUPABASE_TEST_SECRET_KEY ?? '',
      NEXT_PUBLIC_APP_ORIGIN: 'http://localhost:3000',
    },
  },
});
