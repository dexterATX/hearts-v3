// vitest.config.ts — pure-logic tests run in plain node (§2.9):
// every model.ts, every GameRules, the outbox core, the SeqBuffer.
// No Expo, no RN, no network — that is the point of the layering.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', 'supabase/functions/**'],
  },
});
