// app/(tabs)/play.tsx — the game picker + active sessions (§7.6–7.10).
// Thin: routes to game screens; session-start logic lives in the games slice.
import { useEffect, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Text, Card, Button } from '../../ui';
import { colors, spacing } from '../../theme/theme';
import { useSession } from '../../lib/session/store';
import { usePublishPresence } from '../../features/presence';
import {
  listActiveSessions,
  useStartHangman,
  useStartBattleship,
  useStartQuiz,
  useStartCards,
} from '../../features/games';
import type { GameKind, GameSessionRow } from '../../lib/db/database.types';

const GAMES: { kind: GameKind; title: string; blurb: string; emoji: string }[] = [
  { kind: 'hangman', title: 'loves me, loves me not', blurb: 'a word, a daisy, six petals', emoji: '🌼' },
  { kind: 'battleship', title: 'find my hearts', blurb: 'hide them, seek hers', emoji: '♥️' },
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

function GameCard({ kind, title, blurb, emoji }: (typeof GAMES)[number]) {
  const { start, busy } = useStart(kind);
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Text variant="title" style={{ marginBottom: spacing.xs }}>
        {emoji} {title}
      </Text>
      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.md }}>
        {blurb}
      </Text>
      <Button
        label={busy ? 'starting…' : 'new game'}
        tone="ghost"
        disabled={busy}
        onPress={() =>
          void start().then((res) => {
            if (res.ok) router.push(gameHref(kind, res.data.id));
          })
        }
      />
    </Card>
  );
}

export default function PlayTab() {
  usePublishPresence('play');
  const coupleId = useSession((s) => s.coupleId);
  const [active, setActive] = useState<GameSessionRow[]>([]);

  const query = useQuery({
    queryKey: ['active-sessions', coupleId],
    queryFn: async () => {
      const res = await listActiveSessions(coupleId as string);
      return res.ok ? res.data : [];
    },
    enabled: !!coupleId,
  });

  useEffect(() => {
    if (query.data) setActive(query.data);
  }, [query.data]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {active.length > 0 ? (
          <>
            <Text variant="caption" color={colors.gold} style={{ marginBottom: spacing.sm }}>
              games in progress
            </Text>
            {active.map((s) => (
              <Pressable key={s.id} onPress={() => router.push(gameHref(s.kind as GameKind, s.id))}>
                <Card style={{ marginBottom: spacing.sm, borderColor: colors.rose }}>
                  <Text variant="body">
                    {GAMES.find((g) => g.kind === s.kind)?.emoji} {GAMES.find((g) => g.kind === s.kind)?.title}
                  </Text>
                  <Text variant="caption" color={colors.muted}>
                    started {new Date(s.created_at).toLocaleDateString()} — tap to jump back in
                  </Text>
                </Card>
              </Pressable>
            ))}
            <View style={{ height: spacing.lg }} />
          </>
        ) : null}

        {GAMES.map((g) => (
          <GameCard key={g.kind} {...g} />
        ))}

        <Pressable onPress={() => router.push('/canvas')}>
          <Card style={{ marginTop: spacing.sm }}>
            <Text variant="title" style={{ marginBottom: spacing.xs }}>
              🎨 draw together
            </Text>
            <Text variant="small" color={colors.muted}>
              one canvas, two phones, live strokes
            </Text>
          </Card>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
