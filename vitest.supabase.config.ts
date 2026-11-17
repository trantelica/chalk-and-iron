import { defineConfig } from 'vitest/config';
import { join } from 'node:path';

// Tests that run against Supabase's own local version, in GitHub's test runs
// (decided 17 Nov 2026, design Section 10E point 10). They need
// `npx supabase start` first, then scripts/supabase-test-env.mjs.
export default defineConfig({
  resolve: {
    alias: {
      '@': join(import.meta.dirname, 'src'),
      '@data': join(import.meta.dirname, 'data'),
      // The server's code refuses to load outside the server; the tests are the server here.
      'server-only': join(import.meta.dirname, 'tests', 'supabase', 'server-only-stub.ts'),
    },
  },
  test: {
    include: ['tests/supabase/**/*.test.ts'],
    setupFiles: [join(import.meta.dirname, 'tests', 'supabase', 'setup-env.ts')],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
