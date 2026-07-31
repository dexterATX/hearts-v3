// supabase/functions/notify/index.ts — §7.18 / §2.7.
// THE single fan-out: Postgres trigger → here → Expo Push. Features never
// send pushes themselves. Reads notification_prefs, respects toggles,
// attaches a deep link. Deno 2.1.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// new-style secrets ship as JSON dicts (research); fall back to legacy
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
const SERVICE_KEY = secretKeys['default'] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SHARED_SECRET = Deno.env.get('HEARTS_NOTIFY_SECRET') ?? '';

type Payload = {
  table: string;
  couple_id: string;
  author_id: string;
  row: Record<string, unknown>;
};

const TITLES: Record<string, string> = {
  moods: 'a mood just for you',
  letters: 'a letter, sealed with a kiss',
  voice_notes: 'her voice, waiting for you',
  photos: 'a new photo of us',
  game_moves: 'your move ♥',
};

function bodyFor(p: Payload): string {
  switch (p.table) {
    case 'moods':
      return `feeling ${String(p.row.mood ?? 'something')} right now`;
    case 'letters':
      return `"${String(p.row.label ?? 'for you')}" — open when ready`;
    case 'voice_notes':
      return 'hold it to your ear';
    case 'photos':
      return 'come see';
    case 'game_moves':
      return 'the game is waiting on you';
    default:
      return 'something new in hearts';
  }
}

function pathFor(p: Payload): string {
  switch (p.table) {
    case 'letters':
      return `/(tabs)/letters`;
    case 'voice_notes':
      return '/(tabs)/us';
    case 'photos':
      return '/(tabs)/us';
    case 'game_moves':
      return '/(tabs)/play';
    default:
      return '/(tabs)';
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  // only our database triggers may call this
  const secret = req.headers.get('x-hearts-secret') ?? '';
  if (!SHARED_SECRET || secret !== SHARED_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  // P2: validate the payload before touching anything — a trigger bug or a
  // crafted request must not fan pushes out to strangers
  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !payload ||
    typeof payload.table !== 'string' ||
    !(payload.table in TITLES) ||
    typeof payload.couple_id !== 'string' ||
    !UUID.test(payload.couple_id) ||
    typeof payload.author_id !== 'string' ||
    !UUID.test(payload.author_id) ||
    typeof payload.row !== 'object' ||
    payload.row === null ||
    JSON.stringify(payload.row).length > 64_000
  ) {
    return new Response('invalid payload', { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // who is the OTHER person in this couple?
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, push_token, display_name')
    .eq('couple_id', payload.couple_id)
    .neq('id', payload.author_id);
  const recipient = profiles?.[0];
  if (!recipient?.push_token) return new Response('no recipient token', { status: 200 });

  // respect per-feature toggles (§7.17): prefs jsonb, missing = on
  const { data: prefsRow } = await admin
    .from('notification_prefs')
    .select('prefs')
    .eq('profile_id', recipient.id)
    .maybeSingle();
  const prefs = (prefsRow?.prefs ?? {}) as Record<string, boolean>;
  if (prefs[payload.table] === false) {
    return new Response('muted by prefs', { status: 200 });
  }

  const push = {
    to: recipient.push_token,
    title: TITLES[payload.table] ?? 'hearts',
    body: bodyFor(payload),
    sound: 'default',
    channelId: 'hearts',
    data: { path: pathFor(payload) },
  };

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(push),
  });

  return new Response(JSON.stringify({ ok: res.ok }), {
    status: res.ok ? 200 : 502,
    headers: { 'content-type': 'application/json' },
  });
});
