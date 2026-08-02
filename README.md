# hearts v3 ♥

A private mobile app for exactly two people — Scotty and Annsleigh.
Not a product. A gift. No analytics, no growth loops, no engagement mechanics.
Two users, one couple, everything live across two phones.

## Stack (2026-verified)

Expo SDK 57 · React Native 0.86 · TypeScript (strict) · expo-router (file-based)
Supabase: Postgres · Auth · Realtime · Storage · Edge Functions (Deno 2.1)
Zustand 5 (client state) · TanStack Query v5 (server state)
react-native-reanimated 4 + react-native-worklets · gesture-handler 2.32 · expo-haptics
expo-notifications · expo-audio · expo-image · expo-local-authentication
expo-sqlite (durable outbox) · vitest (pure-logic tests)

## Architecture — the one rule

```
app/  →  features/  →  lib/  →  (nothing)
```

Dependencies point one way only. **Features never import each other** — when two
features interact, they do it through the Zustand session store, the TanStack
Query cache, or the realtime bus (`couple:{couple_id}`, one channel, typed events).

Every feature slice has exactly this shape:

```
model.ts   pure logic, no RN imports, runs in plain node, vitest-covered
api.ts     queries + mutations — the ONLY file touching lib/db
hooks.ts   React bindings over api + model
ui/        components private to the slice
index.ts   the slice's public surface — nothing else is importable
```

## The hard parts

- **Writes go through the outbox** (`lib/sync/`). Every mutation gets a
  client-generated `op_id` (idempotency key), applies optimistically, persists
  to expo-sqlite, and flushes oldest-first with backoff. Server-side, content
  tables carry a unique `op_id` so replays are no-ops. Fully usable in airplane mode.
- **Reads split by ownership.** TanStack Query owns server data; Zustand owns
  only session, couple, presence, outbox status, ephemeral UI. Realtime events
  invalidate or patch the Query cache — never mirrored into Zustand.
- **Realtime is a fast path, never truth.** Every event is also derivable from
  Postgres; `lib/sync/reconcile.ts` self-heals on reconnect.
- **One turn engine, four games** (`features/games/engine/`). `game_moves` is an
  append-only log, `UNIQUE(session_id, seq)` is the concurrency backstop, both
  phones fold the same log through pure `apply()`. Battleship fleets and hangman
  words never leave the device — the sea's owner resolves verdicts locally.
- **Notifications have one path.** Postgres trigger → `notify` edge function →
  Expo Push, respecting `notification_prefs` and attaching a deep link.

## Setup

```bash
npm install
cp .env.example .env   # EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx eas init           # links the project and fills extra.eas.projectId in app.json

# database
npx supabase link --project-ref <ref>
npx supabase db push   # applies supabase/migrations/0001_init.sql
npm run db:types       # regenerate lib/db/database.types.ts from the live schema

# notify fan-out (once) — verify_jwt=false lives in supabase/config.toml
# because the database trigger calls it without a user JWT
npx supabase secrets set HEARTS_NOTIFY_SECRET=<random>
# then in the SQL editor:
#   alter database postgres set app.notify_url = 'https://<ref>.supabase.co/functions/v1/notify';
#   alter database postgres set app.notify_secret = '<same random>';
npm run functions:deploy

# AI companion (once) — any OpenAI-compatible endpoint
npx supabase secrets set AI_BASE_URL=https://api.openai.com/v1 AI_API_KEY=sk-... AI_MODEL=gpt-4o-mini

npm start              # then build a dev client (push needs one — not Expo Go)
```

## Tests

```bash
npm test               # vitest — engine, all four games' rules, outbox, letters
npm run typecheck      # tsc --noEmit, strict
```

## House rules kept everywhere

- Every async path has a loading AND an error state; every list has an empty
  state written in the house voice.
- Copy is written for whoever is holding the phone: the reader is always "you",
  the other person is always `usePartnerName()`. No string may assume which of
  the two is reading it, so no gendered pronouns anywhere in the UI.
- Every interactive element has a press spring and a haptic. Never a linear easing.
- No screen ever says a user lost or failed; every game ending is affectionate
  on BOTH phones, and every game state has an exit.
- Destructive actions take two taps, never a confirm modal.
- Sealed letters never show a remaining count. The pile is a promise, not a number.
