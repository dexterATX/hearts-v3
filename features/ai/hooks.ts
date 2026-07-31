// features/ai/hooks.ts — streaming companion state.
import { useState, useCallback, useRef } from 'react';
import { useSession } from '../../lib/session/store';
import { streamCompanion, buildRecapContext } from './api';
import type { CompanionMode } from './model';

export type CompanionState = {
  text: string;
  streaming: boolean;
  error: string | null;
  ask: (mode: CompanionMode, context: string) => void;
  stop: () => void;
  clear: () => void;
};

export function useCompanion(): CompanionState {
  const me = useSession((s) => s.me?.display_name || 'Scotty');
  const her = useSession((s) => s.partner?.display_name || 'Annsleigh');
  const coupleId = useSession((s) => s.coupleId);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const ask = useCallback(
    (mode: CompanionMode, context: string) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setText('');
      setError(null);
      setStreaming(true);
      void (async () => {
        let ctx = context;
        // §7.16: the recap feeds on the real month, not on typed context
        if (mode === 'recap' && !ctx.trim() && coupleId) {
          const built = await buildRecapContext(coupleId);
          if (built.ok) ctx = built.data;
        }
        const res = await streamCompanion(mode, ctx, { me, her }, setText, controller.signal);
        setStreaming(false);
        if (!res.ok && res.error.message !== 'stopped mid-thought') setError(res.error.message);
      })();
    },
    [me, her, coupleId],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
    setStreaming(false);
  }, []);

  const clear = useCallback(() => {
    abort.current?.abort();
    setText('');
    setError(null);
    setStreaming(false);
  }, []);

  return { text, streaming, error, ask, stop, clear };
}
