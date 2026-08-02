// vitest.config.ts — pure-logic tests run in plain node (§2.9):
// every model.ts, every GameRules, the outbox core, the SeqBuffer.
// No Expo, no RN, no network — that is the point of the layering.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // .claude/worktrees holds full clones of this repo; without excluding them
    // vitest globbed 3 copies of every test (27 files, ~201 "tests") and any
    // stale worktree could fail the run for reasons unrelated to the tree.
    exclude: ['node_modules/**', 'supabase/functions/**', '.claude/**'],
  },
});
