// features/games/ui/PlayScreen.tsx — the arcade. A slowly drifting backdrop
// behind a scroll the header leads: sessions in progress first (the live
// strip), then the four games dealt in a staggered cascade, then the canvas.
// All data and start logic lives here; the cards themselves are dumb.
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { spacing } from '../../../theme/theme';
import { useSession } from '../../../lib/session/store';
import type { GameKind } from '../../../lib/db/database.types';
import { listActiveSessions, abandonSession } from '../engine/session';
import { useStartHangman } from '../hangman/hooks';
import { useStartBattleship } from '../battleship/hooks';
import { useStartQuiz } from '../quiz/hooks';
import { useStartCards } from '../cards/hooks';
import { ArcadeBackdrop } from './ArcadeBackdrop';
import { ArcadeHeader } from './ArcadeHeader';
import { ActiveSessions } from './ActiveSessions';
import { ArcadeCard } from './ArcadeCard';
import { ARCADE_GAMES, arcadeHref } from './arcadeMeta';

// all four start hooks run unconditionally and the switch picks one — hook
// order never depends on which game a card renders
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

/** One game in the arcade: owns its start mutation and surfaces a failed
 *  start on the card instead of letting it vanish silently. */
function ArcadeGameCard({
  kind,
  title,
  blurb,
  index,
}: (typeof ARCADE_GAMES)[number] & { index: number }) {
  const { start, busy } = useStart(kind);
  const [error, setError] = useState<string | null>(null);

  return (
    <ArcadeCard
      kind={kind}
      title={title}
      blurb={blurb}
      index={index}
      busy={busy}
      error={error}
      onPress={() => {
        setError(null);
        void start().then((res) => {
          if (res.ok) {
            router.push(arcadeHref(kind, res.data.id));
            return;
          }
          setError(res.error.message);
        });
      }}
    />
  );
}

const ACTIVE_KEY = 'active-sessions';

export function PlayScreen() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [ACTIVE_KEY, coupleId],
    queryFn: async () => {
      const res = await listActiveSessions(coupleId as string);
      return res.ok ? res.data : [];
    },
    enabled: !!coupleId,
  });

  const active = query.data ?? [];

  const putAway = async (sessionId: string) => {
    await abandonSession(sessionId);
    void queryClient.invalidateQueries({ queryKey: [ACTIVE_KEY, coupleId] });
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ArcadeBackdrop />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: spacing.huge,
          gap: 0, // sections own their rhythm
        }}
      >
        <ArcadeHeader />

        {active.length > 0 ? (
          <ActiveSessions
            sessions={active}
            onOpen={(s) => router.push(arcadeHref(s.kind as GameKind, s.id))}
            onPutAway={(id) => void putAway(id)}
          />
        ) : null}

        <View
          style={{
            paddingHorizontal: spacing.lg,
            gap: spacing.md,
            marginTop: spacing.lg,
          }}
        >
          {/* the header owns the page title now; this just keeps some air */}
          <View style={{ height: spacing.sm }} />
          {ARCADE_GAMES.map((g, i) => (
            <ArcadeGameCard key={g.kind} {...g} index={active.length + i} />
          ))}

          <ArcadeCard
            kind="canvas"
            title="draw together"
            blurb="one canvas, two phones, live strokes"
            index={active.length + ARCADE_GAMES.length}
            onPress={() => router.push('/canvas')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
