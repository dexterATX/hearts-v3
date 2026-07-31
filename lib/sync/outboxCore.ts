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

export type SendError = { status?: number; code?: string; message?: string };

/**
 * Classify a PostgREST/Postgres error the way decide() needs it.
 * PostgrestError HAS NO `.status` field (P1 finding) — only `code`, `message`,
 * `details`, `hint`. The HTTP status must be derived from the code:
 *   23505 unique violation        → 409 (permanent: a real conflict)
 *   23503 fk violation            → 409 (permanent)
 *   42501 insufficient privilege  → 403 (RLS — retrying cannot help)
 *   22xxx data exceptions         → 400 (bad payload — permanent)
 *   PGRST1xx postgrest errors     → 400 (schema/API misuse — permanent)
 *   anything else / no code       → no status → treated as transient network
 */
export function classifyError(e: { code?: string; message?: string }): SendError {
  const code = e.code ?? '';
  if (code === '23505' || code === '23503') return { status: 409, code, message: e.message };
  if (code === '42501') return { status: 403, code, message: e.message };
  if (/^22[0-9A-Z]{3}$/.test(code)) return { status: 400, code, message: e.message };
  if (/^PGRST1\d{2}$/.test(code)) return { status: 400, code, message: e.message };
  return { code: code || undefined, message: e.message };
}

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
  lastError: SendError | null,
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
