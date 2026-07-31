// lib/sync/reconcile.ts — cold start and socket-recovery heal (spec §2.5:
// "a missed broadcast self-heals on the next fetch"). Strategy per research:
// default to invalidateQueries (server stays source of truth); fine-grained
// setQueryData patches are reserved for the hot paths inside features.
import type { QueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { flush } from './outbox';
import { onBusStatus } from './bus';

let started = false;

/** Full resync: every active query refetches, the outbox drains. */
export async function reconcile(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries(); // active queries only — cheap + correct
  await flush();
}

/** Call once from the root layout after the QueryClient exists. */
export function startReconcile(queryClient: QueryClient): () => void {
  if (started) return () => undefined;
  started = true;

  // TanStack's online state is driven by NetInfo (research: isConnected
  // can be null — treat null as online-ish, exactly like the official example)
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );

  // Network healed → resync + drain queue + replay paused mutations
  const unsubNet = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      void reconcile(queryClient);
      void queryClient.resumePausedMutations();
    }
  });

  // Socket healed → resync (missed broadcasts self-heal here)
  const unsubBus = onBusStatus((s) => {
    if (s === 'SUBSCRIBED') void reconcile(queryClient);
  });

  return () => {
    unsubNet();
    unsubBus();
    started = false;
  };
}
