// features/ai/model.ts — pure prompt logic. No RN imports.
export type CompanionMode = 'date-ideas' | 'poem' | 'quiz' | 'recap';

export const MODES: { key: CompanionMode; label: string; hint: string }[] = [
  { key: 'date-ideas', label: '💡 date ideas', hint: 'three ideas that sound like you two' },
  { key: 'poem', label: '✒️ poem draft', hint: 'a starting draft, in your voice' },
  { key: 'quiz', label: '❓ quiz questions', hint: 'fresh questions for the pile' },
  { key: 'recap', label: '📖 monthly recap', hint: 'our month, told back to us' },
];

export function systemPrompt(mode: CompanionMode, names: { me: string; her: string }): string {
  const base = `You are the private companion inside "hearts", a two-person app for ${names.me} and ${names.her}. Write warmly, plainly, and personally. Never cheesy greeting-card filler. Never mention being an AI.`;
  switch (mode) {
    case 'date-ideas':
      return `${base} Suggest exactly 3 date ideas, each with a title and two sentences. Make them specific and doable this month, not generic.`;
    case 'poem':
      return `${base} Draft a short poem (8-14 lines) he could finish and send to her. Write it in his voice: direct, tender, a little plain-spoken. Leave it 90% done so he can make it his.`;
    case 'quiz':
      return `${base} Write 5 "how well do you know me" quiz questions for a couple. Each with 4 options; mark the suggested answer. Keep them sweet, funny, or deep — never cruel.`;
    case 'recap':
      return `${base} Write a gentle monthly recap of the couple's shared activity as a short story of their month. Use only what the data says; invent nothing.`;
  }
}

export function userPrompt(mode: CompanionMode, context: string): string {
  switch (mode) {
    case 'date-ideas':
      return `Context about us: ${context || 'a couple who like quiet evenings and small adventures'}`;
    case 'poem':
      return `What the poem should be about: ${context || 'how much she means to me'}`;
    case 'quiz':
      return `About us (for inspiration): ${context || 'long-distance-ish, playful, like games'}`;
    case 'recap':
      return `Our month in data: ${context}`;
  }
}

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
