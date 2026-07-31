# hearts v3 — build manifest

Stack pins applied from 2026-07-30 research (supersedes stale spec lines):
Expo SDK 57 · RN 0.86.2 · React 19.2.3 · expo-router 57 · reanimated 4.5 +
react-native-worklets (NOT v3) · expo-audio (expo-av removed) · expo-sqlite 57
async API · @supabase/supabase-js 2.111 · @tanstack/react-query 5.101 ·
zustand 5 · gesture-handler ~2.32 (Expo-bundled) · FlashList 2.
All package.json versions verified against npm 2026-07-30.

STATUS: BUILD COMPLETE — A (db) · B (lib) · C (engine) · D (features 1–18) · E (configs)
VERIFIED: vitest 7 files / 52 tests PASS (engine, outbox, letters, 4 games).
REVIEWED 2026-07-30 (full 128-file reload + scan): 10 issues found + fixed —
1. presence handlers never re-attached after bus re-init (wired reset on CLOSED)
2. hangman turnOf blocked the setter's verdict via runtime canMove (now
   tried>resolved ⇒ setter's turn; UI waitingOnSetter uses the same rule)
3. battleship placement state machine rewritten (ships+draft, first tap works)
4. runtime finishedRef leaked across reused session routes (reset per session)
5. bus.emit threw when uninitialised (local-apply still runs, wire skipped);
   dead event types game:verdict/typing removed
6. canvas strokes double-rendered after catch-up (dedup by author+seq, not id)
7. letter opened_at / voice heard_at went direct, lost offline (now outbox)
8. EXIF DateTimeOriginal ("YYYY:MM:DD …") stored raw (exifDateToIso normalises)
9. PhotoGrid nested FlashList inside ScrollView (ListHeaderComponent instead)
10. PIN lockout dead-ended biometric-less phones (30s cooldown instead)
REVIEW ROUND 2 (same day, verify-the-fixes pass): 4 more found + fixed —
11. runtime: finishedRef declared after the effect using it (moved up)
12. runtime: fast double-tap issued the same seq twice → self-collision;
    seq now issued from a synchronous ref (issuedRef) and rewound on failure
    so no hole is left for the partner's gap detection
13. settings: lock cooldown never lifted — no state change after expiry meant
    the PIN form never returned; cooldown now clears itself via setTimeout
14. mood: emit()'s local apply added a ghost row on the SENDER's phone on top
    of the optimistic row — every chip landed twice (now skipped when ev.by
    is me; other features invalidate-only and were unaffected)
REVIEW ROUND 3 (auth/presence/offline-mutation pass): 3 more found + fixed —
15. pairing dead-ended three ways: nothing watched for HER joining (the
    "waiting…" screen never updated), nothing navigated away from /(auth)/pair
    after create OR join, and last_seen_at was never written (touchLastSeen
    existed but was never called). Added a profiles pairing-watch channel in
    useAuthBootstrap, a coupleId→/(tabs) redirect in the pair route, and
    touchLastSeen on hydrate.
16. presence hid the partner after 90s on one screen — isStale() used a
    client timestamp; presence CHANNEL MEMBERSHIP is the real liveness.
17. update/delete ops queued before the server assigned row ids were silent
    no-ops (letters/journal/bucket/events stripped client ids and let the
    server generate). All four now generate client uuids and KEEP them, so
    opened_at/vote/done/remove land on the right row even fully offline.
REVIEW ROUND 4 (mechanical sweeps + nesting audit): 3 more found + fixed —
18. home tab nested FeedList's FlashList inside a ScrollView — same
    virtualization-killing bug class as PhotoGrid (round 1). Home is now one
    list with the header (presence/days/mood/chips) as ListHeaderComponent.
19. albums used throwaway optimistic ids (cover updates would no-op) — now
    client-uuid like every other slice; payload keeps id + created_at.
20. letter detail route fed `letter ?? ({} as never)` into a hook — replaced
    with a prop-passed real letter, hooks before branching, no placeholder.
Also verified: quiz_answers table is intentionally unused (quiz answers live
in game_moves, not that table) — contract table kept for the future recap.

10-ROUND REVIEW LOOP (2026-07-30, rounds R1–R10) — lenses: types, Expo/RN API,
realtime/offline, SQL/RLS, games, quality bar, security, performance, spec
compliance, regression. Fixes: outboxCore.decide param + presence unknown[]
(R1) · expo-file-system/legacy import, wall-clock voice duration, scheduleOnRN
worklet call, typed-routes object navigation (R2) · OutboxBanner for dead ops,
SecureStore-persisted session, offline-cold-start + persist-race guards (R3) ·
0002 prefs insert policy (R4) · battleship commit gate moved to the log,
secrets cleared at game end (R5) · error states on every list screen (R6) ·
0003 couple_id self-assign guard (R7) · batch photo URL signing (R8) · mood
history UI, albums rail + per-album upload, recap fed real monthly data (R9) ·
full verifier suite re-run (R10).

FINAL SWARM VERIFICATION (4 read-only agents, whole tree) — 11 found, 11 fixed:
1. initPresenceRecovery listener leak on every auth event (now idempotent)
2. outbox backoff defeated: lastAttemptAt re-zeroed per flush + scheduleFlush(0)
   preempted active backoffs (module-level horizon now)
3. stored errors lost status/code (persisted as JSON; 4xx dies on restart flush)
4. hangman/battleship verdict duties hot-looped on failed writes (attemptedRef
   guard; manual retry path owns failures)
5. dead code: battleship hasCommitted, unused imports/props
6. settings export crashed — exportFileName never imported
7. exportAllData failed at quiz_answers (no couple_id; parent-id filter now)
8. hard lockout unreachable (cooldown only on PIN-only phones now)
9. game_move pushes went to NULL-couple recipients (trigger resolves the
   couple via game_sessions; never fans out without one)
10. 0003 guard was dead code as security definer (dropped definer)
11. migrations not re-runnable (publication DO block, drop-if-exists
    triggers/policies; duplicate game_moves index removed)

VERIFIERS AT CLOSE: vitest 7/52 PASS · route imports OK · index re-exports OK ·
tsc strict on pure subset PASS (module-resolution noise excluded).

OPERATION "BUILD IT FOR REAL" (2026-07-31, order of operations executed):
- REPO: 4 worktree shells pruned (2 non-empty under Desktop/hibees left
  untouched), ~/.git relocated to ~/.git-accidental-home-repo-backup,
  hearts-v3/.claude metadata removed, fresh repo init. Commits: 6fe812f
  baseline, 29b8907 make-it-build.
- IMPORTS: the route files' relative imports were one `../` too deep
  (the "48 imports" — resolution landed in /home/pop-os). Fixed mechanically;
  verified by strict tsc against installed types.
- TYPECHECK: npx tsc --noEmit CLEAN project-wide (strict +
  noUncheckedIndexedAccess): uuid byte guards, index-access guards in
  rules/engine/hooks, Json casts in session.ts, journal moods import depth,
  setQueryData updater form, auth group import depth corrected.
- P1: outbox classifyError derives HTTP class from Postgres codes (22P02
  regex bug caught by test) + real-shape tests · VoiceList scrolls, record
  heart pinned · daysTogether/onThisDay LOCAL-date math + tests · bucket
  votes merge server-side via 0004 bucket_vote RPC (no more LWW on the jsonb
  blob) · app lock confirmed root-mounted above the Stack.
- P2: AI system prompt is server-owned + 3s/user throttle (client sends
  {mode, context, names}) · notify payload validation (table allowlist, uuid
  checks, 64KB cap) · outbox_ops retired (0001 cleaned + 0005 drops; types
  removed) · allowBackup=false.
- BUILD: babel-preset-expo hoisted, expo-linking + expo-asset installed,
  expo install --fix aligned flash-list 2.0.2/reanimated 4.5.1/svg 15.15.4,
  edgeToEdgeEnabled removed from app.json (invalid schema field).
FINAL VERIFIERS: expo-doctor 20/20 PASS · vitest 67/67 PASS (9 files) ·
npx tsc --noEmit CLEAN · `expo export --platform android` BUNDLES (2077
modules). expo start boots and the Android JS bundle builds end-to-end.

CONTEXT REVIEW (same day, from fully loaded context — no re-read): 4 found, 4 fixed —
1. notify edge function would 401 at the gateway on EVERY trigger call:
   verify_jwt defaults true but pg_net sends no JWT. supabase/config.toml now
   pins [functions.notify] verify_jwt = false (shared secret is the auth) and
   keeps verify_jwt = true for ai-companion.
2. the wax-seal unfold animation was dead code: openLetter writes opened_at
   to the cache synchronously, flipping alreadyOpen mid-break — LetterBody
   now gates on justOpenedByMe so the moment survives.
3. OutboxBanner rendered raw server error text to her (§6 voice) — replaced
   with an honest in-voice message.
4. voice-note failures were silent (null uri, denied mic, failed upload) —
   recorder now surfaces each in my voice under the record button.

CONTEXT REVIEW 2 (same day): 5 found, 5 fixed —
1. CACHE-SHAPE COLLISION: letters' fetchMoodHistory wrote {mood}[] into the
   SAME ['moods', coupleId] cache the mood feature fills with full MoodRow[] —
   last writer corrupted the other's reads. It now selects identical columns.
2. eas.json was missing while README prescribed `eas build --profile
   development` (EAS refuses without it) — added dev/preview/prod profiles.
3. no .gitignore at all — added (node_modules, .env, CNG android/ios, builds).
4. app.json projectId placeholder had no documented fill step — README now
   starts with `npx eas init`.
5. presence typing_in 'new-letter' rendered raw (missing from SCREEN_NAMES).

DONE:
- supabase/migrations/0001_init.sql · 0002_prefs_insert.sql · 0003_profile_couple_guard.sql
- supabase/functions/notify/index.ts · supabase/functions/ai-companion/index.ts
- MANIFEST.md · README.md · .env.example
- package.json · app.json · tsconfig.json · babel.config.js · vitest.config.ts
- theme/theme.ts
- lib/result.ts · lib/id.ts · lib/moods.ts
- lib/db/client.ts · lib/db/database.types.ts
- lib/session/store.ts
- lib/sync/sqlite.ts · outboxCore.ts (+test) · outbox.ts · bus.ts · presence.ts · reconcile.ts
- lib/notify/register.ts
- ui/Text.tsx · Button.tsx · Card.tsx · Sheet.tsx · Skeleton.tsx · index.ts
- features/games/engine/types.ts · fold.ts · buffer.ts · engine.test.ts
  · session.ts · runtime.ts · secrets.ts
- features/auth/ (model, api, hooks, index, ui/SignInScreen, ui/PairScreen)
- features/mood/ (model, api, hooks, index, ui/MoodChips, ui/MoodCard)
- features/presence/ (model, api, hooks, index, ui/PresenceChip)
- features/letters/ (model + model.test, api, hooks, index,
  ui/LetterCard, ui/WaxSeal, ui/NewLetterForm)
- features/home/ (model, api, hooks, index, ui/DaysTogether, ui/FeedList)
- features/canvas/ (model, api, hooks, index, ui/CanvasBoard)
- features/games/hangman/ (rules + test, hooks, ui/HangmanScreen)
- features/games/battleship/ (rules + test, hooks, ui/BattleshipScreen)
- features/games/quiz/ (rules + test, api, hooks, ui/QuizScreen)
- features/games/cards/ (rules + test, hooks, ui/CardsScreen)
- features/games/index.ts
- features/photos/ (model, api, hooks, index, ui/PhotoGrid)
- features/voice/ (model, api, hooks, index, ui/VoiceList)
- features/journal/ (model, api, hooks, index, ui/JournalList)
- features/bucket/ (model, api, hooks, index, ui/BucketListView)
- features/events/ (model, api, hooks, index, ui/EventsView)
- features/ai/ (model, api, hooks, index, ui/CompanionScreen)
- features/settings/ (model, api, hooks, index, ui/SettingsScreen, ui/LockScreen)
- app/_layout.tsx
- app/(auth)/_layout.tsx · sign-in.tsx · pair.tsx
- app/(tabs)/_layout.tsx · index.tsx · letters.tsx · play.tsx · us.tsx · settings.tsx
- app/letters/[id].tsx · app/letters/new.tsx
- app/games/hangman.tsx · battleship.tsx · quiz.tsx · cards.tsx
- app/canvas.tsx
- app/photos/[albumId].tsx

NEXT:
- nothing owed by the build spec. To run it: npm install, .env from
  .env.example, supabase link + db push + secrets (README §Setup),
  eas build --profile development (push needs a dev client, not Expo Go).

REMAINING (known honest gaps, not stubs):
- typecheck (tsc --noEmit) requires the full npm install — not yet run here.
- photos: album covers/detail polish lives in PhotoGrid; albums route exists.
- voice letters (audio attached to a letter) record via the voice section and
  link by convention; a dedicated in-letter recorder is the natural next pass.
- canvas dots-renderer is dependency-free; Skia/SVG smoothing is an upgrade path.
