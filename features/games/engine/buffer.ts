// features/games/engine/buffer.ts — out-of-order / duplicate arrivals.
// Research pattern: per-stream lastSeq; seq == last+1 deliver; seq > last+1
// hold in a bounded sorted buffer + report the gap (caller gap-fills from
// Postgres); seq <= last → drop as duplicate.
import type { MoveEnvelope } from './types';

export type Gap = { from: number; to: number };

export class SeqBuffer<M = unknown> {
  private last: number;
  private held = new Map<number, MoveEnvelope<M>>(); // seq → move
  private readonly maxHeld: number;

  constructor(lastSeq = 0, maxHeld = 256) {
    this.last = lastSeq;
    this.maxHeld = maxHeld;
  }

  get lastSeq(): number {
    return this.last;
  }

  /**
   * Offer a live move. Returns the moves ready to apply IN ORDER (may be
   * empty), plus the gap if one opened — the caller then runs a catch-up
   * query for [gap.from, gap.to] from the durable log.
   */
  offer(move: MoveEnvelope<M>): { ready: MoveEnvelope<M>[]; gap: Gap | null; duplicate: boolean } {
    if (move.seq <= this.last || this.held.has(move.seq)) {
      return { ready: [], gap: null, duplicate: true };
    }
    if (move.seq > this.last + 1) {
      if (this.held.size >= this.maxHeld) {
        // buffer overflow — treat as full gap from last+1; caller resyncs
        return { ready: [], gap: { from: this.last + 1, to: move.seq - 1 }, duplicate: false };
      }
      this.held.set(move.seq, move);
      return {
        ready: [],
        gap: { from: this.last + 1, to: move.seq - 1 },
        duplicate: false,
      };
    }
    // in-order: deliver this, then drain anything it unblocks
    const ready: MoveEnvelope<M>[] = [move];
    this.last = move.seq;
    while (this.held.has(this.last + 1)) {
      const next = this.held.get(this.last + 1) as MoveEnvelope<M>;
      this.held.delete(next.seq);
      ready.push(next);
      this.last = next.seq;
    }
    return { ready, gap: null, duplicate: false };
  }

  /** Merge a gap-fill page from Postgres (authoritative, ordered). */
  absorbGapFill(moves: readonly MoveEnvelope<M>[]): MoveEnvelope<M>[] {
    const ready: MoveEnvelope<M>[] = [];
    for (const m of moves) {
      if (m.seq <= this.last) continue; // already applied
      if (m.seq !== this.last + 1) {
        this.held.set(m.seq, m); // page had its own hole — keep holding
        continue;
      }
      ready.push(m);
      this.last = m.seq;
      while (this.held.has(this.last + 1)) {
        const next = this.held.get(this.last + 1) as MoveEnvelope<M>;
        this.held.delete(next.seq);
        ready.push(next);
        this.last = next.seq;
      }
    }
    return ready;
  }
}
