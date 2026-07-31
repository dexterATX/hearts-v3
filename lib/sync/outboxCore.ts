// lib/sync/outboxCore.ts — pure outbox logic. No RN, no Expo, no network.
// Runs in plain node → this is what the vitest suite exercises (spec §2.9).

export type OpKind = 'upsert' | 'update' | 'delete';

export type Op = {
  opId: string; // uuid v4, client-generated — the idempotency key
  coupleId: string;
  kind: OpKind;
  table: string;
  payload: Record<string, unknown>; // row incl. op_id for upserts
  attempts: number;
  createdAt: string; // ISO
};

/** Exponential backoff with jitter, capped at 30s. Jitter only ever ADDS to
 *  the base (1.0–1.5×) so the floor is a true exponential. */
export function nextBackoffMs(attempts: number, jitter: () => number = Math.random): number {
  const base = Math.min(1000 * 2 ** attempts, 30_000);
  return Math.min(Math.round(base * (1 + jitter() * 0.5)), 30_000);
}

/** Give up after this many attempts — surfaces as a visible rollback (§2.3.6). */
export const MAX_ATTEMPTS = 8;

export type FlushDecision =
  | { action: 'send' }
  | { action: 'wait'; delayMs: number }
  | { action: 'dead' }; // permanent failure — caller rolls back optimistically

/**
 * Decide what to do with the head op. 4xx (validation/rls/conflict) is dead
 * immediately — retrying cannot help. Network errors back off until MAX.
 */
export function decide(
  op: Op,
  lastError: { status?: number; code?: string; message?: string } | null,
  now: number,
  lastAttemptAt: number,
  jitter: () => number = Math.random,
): FlushDecision {
  if (!lastError) return { action: 'send' };
  const status = lastError.status ?? 0;
  if (status >= 400 && status < 500) return { action: 'dead' };
  if (op.attempts >= MAX_ATTEMPTS) return { action: 'dead' };
  const waitUntil = lastAttemptAt + nextBackoffMs(op.attempts, jitter);
  return now >= waitUntil
    ? { action: 'send' }
    : { action: 'wait', delayMs: waitUntil - now };
}

/** Replayed ops are no-ops server-side (upsert on op_id), so order is what
 *  matters: strictly oldest-first, one at a time — never parallel. */
export function orderForFlush<T extends { createdAt: string }>(ops: T[]): T[] {
  return [...ops].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
