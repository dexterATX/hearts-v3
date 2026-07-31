// lib/sync/outbox.ts — the write path (spec §2.3). UI NEVER calls Supabase
// directly; every mutation enqueues here. Optimistic application happens in
// the feature's hooks.ts (TanStack setQueryData) BEFORE enqueue resolves.
import { supabase } from '../db/client';
import { newUuid as newOpId } from '../id';
import {
  insertOp,
  pendingOps,
  removeOp,
  markAttempt,
  countPending,
  type StoredOp,
} from './sqlite';
import {
  decide,
  orderForFlush,
  MAX_ATTEMPTS,
  classifyError,
  type Op,
  type OpKind,
} from './outboxCore';

export type OutboxStatus = {
  pending: number;
  flushing: boolean;
  dead: DeadOp[];
};

export type DeadOp = { op: Op; reason: string };

type StatusListener = (s: OutboxStatus) => void;

const listeners = new Set<StatusListener>();
let flushing = false;
let dead: DeadOp[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
// Backoff state lives ACROSS flushes (swarm finding): re-zeroing per flush
// made decide()'s wait branch unreachable, and a fresh enqueue's
// scheduleFlush(0) could preempt an in-progress backoff entirely.
let lastAttemptAt = 0;
let backoffUntil = 0;

async function emitStatus(): Promise<void> {
  const s: OutboxStatus = { pending: await countPending(), flushing, dead: [...dead] };
  listeners.forEach((fn) => fn(s));
}

export function subscribeOutbox(fn: StatusListener): () => void {
  listeners.add(fn);
  void emitStatus();
  return () => listeners.delete(fn);
}

/** Drop a dead op after the UI has shown the rollback message. */
export function acknowledgeDead(opId: string): void {
  dead = dead.filter((d) => d.op.opId !== opId);
  void emitStatus();
}

/** Step 1–3 of §2.3: op_id, persist durably, schedule a flush. */
export async function enqueue(input: {
  coupleId: string;
  kind: OpKind;
  table: string;
  payload: Record<string, unknown>;
}): Promise<Op> {
  const op: Op = {
    opId: newOpId(),
    coupleId: input.coupleId,
    kind: input.kind,
    table: input.table,
    // upserts carry the idempotency key INTO the row so the server's
    // unique op_id constraint makes replay a no-op
    payload:
      input.kind === 'upsert' ? { ...input.payload, op_id: input.payload.op_id ?? undefined } : input.payload,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  if (op.kind === 'upsert') op.payload.op_id = op.opId;
  const stored: StoredOp = {
    op_id: op.opId,
    couple_id: op.coupleId,
    kind: op.kind,
    table_name: op.table,
    payload: JSON.stringify(op.payload),
    attempts: 0,
    last_error: null,
    created_at: op.createdAt,
  };
  await insertOp(stored);
  void emitStatus();
  scheduleFlush(0);
  return op;
}

export function scheduleFlush(delayMs: number): void {
  if (flushTimer) clearTimeout(flushTimer);
  // never fire before the current backoff horizon — a new write must not
  // hammer the op that's already backing off
  const at = Math.max(Date.now() + delayMs, backoffUntil);
  flushTimer = setTimeout(() => void flush(), Math.max(0, at - Date.now()));
}

type SendResult = { ok: true } | { ok: false; status?: number; code?: string; message: string };

async function send(op: Op): Promise<SendResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table name is dynamic by design
  const from = supabase.from(op.table as any);
  let res: { error: { code?: string; message?: string } | null };
  if (op.kind === 'upsert') {
    res = await from.upsert(op.payload, { onConflict: 'op_id', ignoreDuplicates: true });
  } else if (op.kind === 'update') {
    const { id, ...patch } = op.payload;
    res = await from.update(patch).eq('id', id as string);
  } else {
    const { id } = op.payload;
    res = await from.delete().eq('id', id as string);
  }
  if (res.error) {
    // PostgrestError has NO .status — derive the HTTP class from the code
    // (P1 finding); transient/network errors carry no status and back off
    const classified = classifyError(res.error);
    return {
      ok: false,
      status: classified.status,
      code: classified.code,
      message: classified.message ?? 'send failed',
    };
  }
  return { ok: true };
}

/** Step 4 of §2.3: drain oldest-first, one at a time, with backoff. */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  void emitStatus();
  try {
    const rows = orderForFlush(
      (await pendingOps()).map((r) => ({
        ...r,
        createdAt: r.created_at,
      })),
    );
    for (const row of rows) {
      const op: Op = {
        opId: row.op_id,
        coupleId: row.couple_id,
        kind: row.kind as OpKind,
        table: row.table_name,
        payload: JSON.parse(row.payload) as Record<string, unknown>,
        attempts: row.attempts,
        createdAt: row.created_at,
      };
      const decision = decide(op, parseStoredError(row.last_error), Date.now(), lastAttemptAt);
      if (decision.action === 'wait') {
        backoffUntil = Date.now() + decision.delayMs;
        scheduleFlush(decision.delayMs);
        break; // strictly ordered — later ops wait behind the head
      }
      if (decision.action === 'dead') {
        await removeOp(op.opId);
        dead = [...dead, { op, reason: row.last_error ?? `failed after ${MAX_ATTEMPTS} tries` }];
        continue;
      }
      lastAttemptAt = Date.now();
      const result = await send(op);
      if (result.ok) {
        await removeOp(op.opId);
      } else {
        const status = result.status ?? 0;
        if (status >= 400 && status < 500) {
          // permanent — dead immediately, no wasted extra write first
          await removeOp(op.opId);
          dead = [...dead, { op, reason: result.message }];
        } else {
          await markAttempt(op.opId, op.attempts + 1, {
            message: result.message,
            status: result.status,
            code: result.code,
          });
          const delay = 1000 * 2 ** Math.min(op.attempts, 5);
          backoffUntil = Date.now() + delay;
          scheduleFlush(delay);
          break; // network down — stop draining, retry later
        }
      }
    }
  } finally {
    flushing = false;
    void emitStatus();
  }
}

/** last_error is stored as JSON {message,status,code}; older rows held a
 *  bare message string — accept both. */
function parseStoredError(
  raw: string | null,
): { status?: number; code?: string; message?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { status?: number; code?: string; message?: string };
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // bare string from an older row
  }
  return { message: raw };
}

/** Test hook / cold-start: how many ops are waiting. */
export { countPending };
