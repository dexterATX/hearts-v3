// features/ai/model.ts — pure companion logic. No RN imports.
// NOTE: prompt CONSTRUCTION is server-owned (P2 hardening) — the client
// sends only {mode, context, names}; the edge function builds the prompts.
export type CompanionMode = 'date-ideas' | 'poem' | 'quiz' | 'recap';

export const MODES: { key: CompanionMode; label: string; hint: string }[] = [
  { key: 'date-ideas', label: '💡 date ideas', hint: 'three ideas that sound like you two' },
  { key: 'poem', label: '✒️ poem draft', hint: 'a starting draft, in your voice' },
  { key: 'quiz', label: '❓ quiz questions', hint: 'fresh questions for the pile' },
  { key: 'recap', label: '📖 monthly recap', hint: 'our month, told back to us' },
];

/** Parse streamed SSE chunks into text deltas (OpenAI-compatible wire format). */
export function parseSseDelta(line: string): string | null {
  if (!line.startsWith('data: ')) return null;
  const data = line.slice(6).trim();
  if (data === '[DONE]') return null;
  try {
    const json = JSON.parse(data) as {
      choices?: { delta?: { content?: string } }[];
    };
    return json.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}
