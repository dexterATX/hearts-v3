// app/(tabs)/play.tsx — the game picker + active sessions (§7.6–7.10).
// Thin: routes to game screens; session-start logic lives in the games slice.
import { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, Card, Button, Icon } from '../../ui';
import { colors, spacing, radius } from '../../theme/theme';
import { useSession } from '../../lib/session/store';
import { usePublishPresence } from '../../features/presence';
import {
  listActiveSessions,
  abandonSession,
  useStartHangman,
  useStartBattleship,
  useStartQuiz,
  useStartCards,
} from '../../features/games';
import type { GameKind } from '../../lib/db/database.types';

const GAMES: { kind: GameKind; title: string; blurb: string; emoji: string }[] = [
  { kind: 'hangman', title: 'loves me, loves me not', blurb: 'a word, a daisy, six petals', emoji: '🌼' },
  { kind: 'battleship', title: 'find my hearts', blurb: 'hide yours, find theirs', emoji: '♥️' },
  { kind: 'quiz', title: 'how well do you know me', blurb: 'one score for both of you', emoji: '❓' },
  { kind: 'cards', title: 'the deck', blurb: 'truth or dare · would you rather · 20q', emoji: '🃏' },
];

// literal pathnames keep typed routes happy; params ride the object form
const GAME_PATHS = {
  hangman: '/games/hangman',
  battleship: '/games/battleship',
  quiz: '/games/quiz',
  cards: '/games/cards',
} as const;

function gameHref(kind: GameKind, sessionId: string) {
  return { pathname: GAME_PATHS[kind], params: { sessionId } } as const;
}

function useStart(kind: GameKind) {
  const hangman = useStartHangman();
  const battleship = useStartBattleship();
  const quiz = useStartQuiz();
  const cards = useStartCards();
  switch (kind) {
    case 'hangman':
      return hangman;
    case 'battleship':
      return battleship;
    case 'quiz':
      return quiz;
    case 'cards':
      return cards;
  }
}

/**
 * One even, token-sized tile per row. The glyph inside is the game's identity
 * — the daisy, the suit, the heart are CONTENT, so they stay; the tile is what
 * turns four differently-shaped emoji into a grid that lines up.
 */
function GlyphTile({ children, tone = 'quiet' }: { children: React.ReactNode; tone?: 'quiet' | 'accent' }) {
  return (
    <View
      style={{
        width: spacing.huge,
        height: spacing.huge,
        borderRadius: radius.md,
        borderWidth: 3,
        borderColor: tone === 'accent' ? colors.blue : colors.line,
        backgroundColor: tone === 'accent' ? colors.blueSoft : colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

function GameCard({ kind, title, blurb, emoji }: (typeof GAMES)[number]) {
  const { start, busy } = useStart(kind);
  // a failed start used to vanish silently — every async path gets an error state
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <GlyphTile>
          <Text variant="title">{emoji}</Text>
        </GlyphTile>
        <View style={{ flex: 1 }}>
          <Text variant="heading">{title}</Text>
          <Text variant="small" color={colors.muted} style={{ marginTop: spacing.xs }}>
            {blurb}
          </Text>
        </View>
      </View>
      <Button
        label="new game"
        tone="ghost"
        loading={busy}
        disabled={busy}
        style={{ marginTop: spacing.lg }}
        onPress={() => {
          setError(null);
          void start().then((res) => {
            if (res.ok) {
              router.push(gameHref(kind, res.data.id));
              return;
            }
            setError(res.error.message);
          });
        }}
      />
      {error ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            marginTop: spacing.md,
          }}
        >
          <Icon name="alert" size={spacing.lg} color={colors.danger} />
          <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const ACTIVE_KEY = 'active-sessions';

export default function PlayTab() {
  usePublishPresence('play');
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();
  const [armed, setArmed] = useState<string | null>(null); // two-tap destructive (§6)

  const query = useQuery({
    queryKey: [ACTIVE_KEY, coupleId],
    queryFn: async () => {
      const res = await listActiveSessions(coupleId as string);
      return res.ok ? res.data : [];
    },
    enabled: !!coupleId,
  });

  // read the cache directly rather than mirroring it into state: the old
  // useState copy only updated when query.data was truthy, so it went stale
  // across a couple change and would have swallowed the refetch below
  const active = query.data ?? [];

  const putAway = async (sessionId: string) => {
    await abandonSession(sessionId);
    void queryClient.invalidateQueries({ queryKey: [ACTIVE_KEY, coupleId] });
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing.huge,
          gap: spacing.xl,
        }}
      >
        {active.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="overline" color={colors.muted} style={{ textTransform: 'uppercase' }}>
              games in progress
            </Text>
            {active.map((s) => {
              const meta = GAMES.find((g) => g.kind === s.kind);
              return (
                <Card key={s.id} variant="accent">
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Pressable
                      accessibilityRole="button"
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                      onPress={() => router.push(gameHref(s.kind as GameKind, s.id))}
                    >
                      <GlyphTile tone="accent">
                        <Text variant="title">{meta?.emoji}</Text>
                      </GlyphTile>
                      <View style={{ flex: 1 }}>
                        <Text variant="heading">{meta?.title}</Text>
                        <Text variant="caption" color={colors.muted} style={{ marginTop: spacing.xs }}>
                          started {new Date(s.created_at).toLocaleDateString()} — tap to jump back in
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        armed === s.id ? 'tap again to put this game away' : 'put this game away'
                      }
                      onPress={() => {
                        if (armed !== s.id) {
                          setArmed(s.id);
                          // functional update so a newer arm is not clobbered
                          setTimeout(() => setArmed((cur) => (cur === s.id ? null : cur)), 3000);
                          return;
                        }
                        setArmed(null);
                        void putAway(s.id);
                      }}
                      style={{ paddingVertical: spacing.sm, paddingLeft: spacing.lg }}
                    >
                      {armed === s.id ? (
                        <Text variant="caption" weight="semibold" color={colors.danger}>
                          sure?
                        </Text>
                      ) : (
                        <Icon name="close" size={spacing.xl} color={colors.muted} />
                      )}
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </View>
        ) : null}

        <View style={{ gap: spacing.md }}>
          {GAMES.map((g) => (
            <GameCard key={g.kind} {...g} />
          ))}

          <Pressable onPress={() => router.push('/canvas')}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <GlyphTile>
                  <Icon name="brush" color={colors.blue} />
                </GlyphTile>
                <View style={{ flex: 1 }}>
                  <Text variant="heading">draw together</Text>
                  <Text variant="small" color={colors.muted} style={{ marginTop: spacing.xs }}>
                    one canvas, two phones, live strokes
                  </Text>
                </View>
                <Icon name="chevronRight" size={spacing.xl} color={colors.faint} />
              </View>
            </Card>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
