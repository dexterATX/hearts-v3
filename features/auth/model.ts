// features/auth/model.ts — pure pairing logic. No RN imports (§2.9).
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — readable aloud
export const INVITE_LENGTH = 6;

/** 6-char code, A-Z 2-9 (matches the CHECK in 0001_init.sql). */
export function generateInviteCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < INVITE_LENGTH; i++) {
    code += INVITE_ALPHABET[Math.floor(rng() * INVITE_ALPHABET.length)];
  }
  return code;
}

export function isValidInviteCode(code: string): boolean {
  return new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_LENGTH}}$`).test(code.toUpperCase().trim());
}

export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().trim();
}

export type PairStage = 'unpaired' | 'code_shown' | 'waiting' | 'paired';

/** Both join orders work: I create + she joins, or she created + I join. */
export function stageFor(coupleId: string | null, createdCode: string | null): PairStage {
  if (coupleId) return 'paired';
  if (createdCode) return 'waiting';
  return 'unpaired';
}
