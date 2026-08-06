// features/home/ui/useStoryArrivals.ts — which story lines just ARRIVED.
// The deal cascade owns the first paint; after that, a line that appears that
// was not there before (partner sent a mood, a sync landed) gets the arrival
// pop. Pure derivation off the data — no bus, no effects beyond one ref.
import { useEffect, useMemo, useRef } from 'react';
import type { StoryDay } from '../model';

function lineIds(days: StoryDay[]): Set<string> {
  const ids = new Set<string>();
  for (const day of days) for (const line of day.lines) ids.add(line.id);
  return ids;
}

/** The diff, pure so vitest can run it in plain node (§2.9 — hooks need React,
 *  this does not). `prevIds === null` is "no data seen yet": the first
 *  non-empty payload is the initial load, which belongs to the deal cascade,
 *  never to the arrival pop. An empty previous set means the same thing — the
 *  feed came back from empty/loading, so everything is a re-deal, nothing is
 *  an arrival. Removals are simply ignored: only NEW ids count. */
export function diffArrivals(prevIds: Set<string> | null, days: StoryDay[]): Set<string> {
  const arrivals = new Set<string>();
  if (!prevIds || prevIds.size === 0) return arrivals;
  for (const day of days) {
    for (const line of day.lines) {
      if (!prevIds.has(line.id)) arrivals.add(line.id);
    }
  }
  return arrivals;
}

/** Stable-per-data-change set of newly-arrived line ids. The diff computes in
 *  useMemo (render-pure, so StrictMode's double render diffing against the
 *  same prevRef.current yields the identical set twice — no arrival is
 *  swallowed); prevRef only advances in useEffect, after commit. */
export function useStoryArrivals(days: StoryDay[]): Set<string> {
  const prevRef = useRef<Set<string> | null>(null);
  const arrivals = useMemo(() => diffArrivals(prevRef.current, days), [days]);
  useEffect(() => {
    prevRef.current = lineIds(days);
  }, [days]);
  return arrivals;
}
