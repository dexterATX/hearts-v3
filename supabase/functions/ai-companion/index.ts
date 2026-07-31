// supabase/functions/ai-companion/index.ts — §7.16 (P2-hardened).
// The SYSTEM PROMPT lives here, server-owned (P2): the client sends only
// {mode, context} — it can no longer steer the companion's persona by
// shipping a custom system prompt. Per-user throttle: 1 call / 3s.
const AI_BASE_URL = Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1';
const AI_API_KEY = Deno.env.get('AI_API_KEY') ?? '';
const AI_MODEL = Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

type Mode = 'date-ideas' | 'poem' | 'quiz' | 'recap';
const MODES: Mode[] = ['date-ideas', 'poem', 'quiz', 'recap'];

function systemPrompt(mode: Mode, names: { me: string; her: string }): string {
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

function userPrompt(mode: Mode, context: string): string {
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

// best-effort per-isolate throttle (P2) — not a security boundary, just a damper
const lastCallAt = new Map<string, number>();
const THROTTLE_MS = 3000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }
  if (!AI_API_KEY) {
    return new Response('companion not configured', { status: 500, headers: cors });
  }

  // who is calling? (gateway verified the JWT; the claim is trusted here)
  const jwt = (req.headers.get('authorization') ?? '').replace(/^bearer /i, '');
  let caller = 'anonymous';
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1] ?? '')) as { sub?: string };
    caller = payload.sub ?? 'anonymous';
  } catch {
    // gateway already enforced the JWT; unparseable claims just share the anon bucket
  }
  const now = Date.now();
  if (now - (lastCallAt.get(caller) ?? 0) < THROTTLE_MS) {
    return new Response('slow down a breath — ask again in a moment', {
      status: 429,
      headers: cors,
    });
  }
  lastCallAt.set(caller, now);

  let body: { mode?: string; context?: string; names?: { me?: string; her?: string } };
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400, headers: cors });
  }
  const mode = MODES.includes(body.mode as Mode) ? (body.mode as Mode) : null;
  if (!mode) return new Response('unknown mode', { status: 400, headers: cors });
  const context = String(body.context ?? '').slice(0, 4000);
  const names = {
    me: String(body.names?.me ?? 'Scotty').slice(0, 60),
    her: String(body.names?.her ?? 'Annsleigh').slice(0, 60),
  };

  const upstream = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt(mode, names) },
        { role: 'user', content: userPrompt(mode, context) },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`upstream said ${upstream.status}`, { status: 502, headers: cors });
  }

  return new Response(upstream.body, {
    headers: {
      ...cors,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
});
