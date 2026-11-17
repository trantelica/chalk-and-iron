import { defineConfig } from 'vitest/config';
import { join } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': join(import.meta.dirname, 'src'), '@data': join(import.meta.dirname, 'data') } },
  test: {
    include: ['tests/**/*.test.ts'],
    // These need Supabase's local version: npm run test:supabase.
    exclude: ['tests/supabase/**'],
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
