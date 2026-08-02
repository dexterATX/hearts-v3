// lib/result.ts — one error shape across every layer boundary (spec §2.8).
// api.ts returns Result<T, AppError>; nothing throws across a boundary.
export type AppError = {
  code: 'network' | 'auth' | 'rls' | 'conflict' | 'validation' | 'unknown';
  message: string; // the house voice, reader-facing — never a stack trace
  cause?: unknown;
};

export type Result<T, E = AppError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = <E extends AppError>(error: E): Result<never, E> => ({ ok: false, error });

export function toAppError(cause: unknown, fallback: string): AppError {
  const anyCause = cause as { code?: string; message?: string } | null;
  if (anyCause?.code === '42501' || anyCause?.code === 'PGRST301') {
    return { code: 'rls', message: fallback, cause };
  }
  if (anyCause?.code === '23505' || anyCause?.code === 'PGRST116') {
    return { code: 'conflict', message: fallback, cause };
  }
  if (anyCause?.message === 'Network request failed' || anyCause?.code === 'PGRST000') {
    return { code: 'network', message: fallback, cause };
  }
  return { code: 'unknown', message: fallback, cause };
}
