// supabase/functions/ai-companion/index.ts — §7.16.
// OpenAI-compatible streaming proxy. Runs on Deno 2.1 (research: all regions).
// The upstream key lives in secrets, NEVER in the app bundle (research §secrets):
//   supabase secrets set AI_BASE_URL=... AI_API_KEY=... AI_MODEL=...
const AI_BASE_URL = Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1';
const AI_API_KEY = Deno.env.get('AI_API_KEY') ?? '';
const AI_MODEL = Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }
  if (!AI_API_KEY) {
    return new Response('companion not configured', { status: 500, headers: cors });
  }

  // the gateway already verified the user JWT (verify_jwt default true)
  let body: { system?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400, headers: cors });
  }
  const system = String(body.system ?? '').slice(0, 4000);
  const prompt = String(body.prompt ?? '').slice(0, 4000);
  if (!prompt) return new Response('prompt required', { status: 400, headers: cors });

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
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`upstream said ${upstream.status}`, { status: 502, headers: cors });
  }

  // pass the SSE stream straight through — the RN client reads it with
  // expo/fetch + ReadableStream (research: streaming works end to end)
  return new Response(upstream.body, {
    headers: {
      ...cors,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
});
