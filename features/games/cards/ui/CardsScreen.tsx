// features/games/cards/ui/CardsScreen.tsx — truth or dare · would you rather · 20q.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, interpolate } from 'react-native-reanimated';
import { Text, Button, Card, Skeleton } from '../../../../ui';
import { colors, spacing, radius, motion } from '../../../../theme/theme';
import { useCards } from '../hooks';
import { type CardLevel } from '../rules';
import { useSession } from '../../../../lib/session/store';

const LEVEL_INFO: { key: CardLevel; label: string; hint: string }[] = [
  { key: 'sweet', label: '🍯 sweet', hint: 'soft questions, easy dares' },
  { key: 'deep', label: '🌊 deep', hint: 'the real stuff' },
  { key: 'spicy', label: '🌶️ spicy', hint: 'only if you both opt in' },
];

const KIND_LABEL: Record<string, string> = {
  truth: 'truth',
  dare: 'dare',
  wyr: 'would you rather',
  twentyq: '20 questions',
};

export function CardsScreen({ sessionId }: { sessionId: string }) {
  const game = useCards(sessionId);
  const partnerName = useSession((s) => s.partner?.nickname || s.partner?.display_name || 'her');
  const [levels, setLevels] = useState<CardLevel[]>(['sweet']);
  const flip = useSharedValue(0);
  const flipStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(flip.value, [0, 1], [1, 1.04]) },
      { rotate: `${interpolate(flip.value, [0, 1], [0, 2])}deg` },
    ],
  }));

  if (game.loading || !game.state) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
        <Skeleton height={260} />
      </View>
    );
  }

  const s = game.state;

  if (game.outcome) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Text variant="title" style={{ textAlign: 'center', marginBottom: spacing.xl }}>
          {game.outcome.summary}
        </Text>
        <Button label="shuffle a new deck" onPress={() => void game.begin(levels)} />
      </View>
    );
  }

  if (s.phase === 'lobby') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl }}>
        <Text variant="title" style={{ marginBottom: spacing.md }}>
          pick your levels
        </Text>
        <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.xl }}>
          spicy stays out unless you both want it in — talk first, tap second.
        </Text>
        {LEVEL_INFO.map((l) => {
          const on = levels.includes(l.key);
          return (
            <Pressable
              key={l.key}
              onPress={() =>
                setLevels((prev) =>
                  on ? prev.filter((p) => p !== l.key) : [...prev, l.key],
                )
              }
              style={{ marginBottom: spacing.sm }}
            >
              <View
                style={{
                  borderWidth: 1,
                  borderColor: on ? colors.rose : colors.line,
                  borderRadius: radius.md,
                  padding: spacing.lg,
                  backgroundColor: on ? colors.surfaceAlt : colors.surface,
                }}
              >
                <Text variant="body" color={on ? colors.rose : colors.ink}>
                  {l.label}
                </Text>
                <Text variant="caption" color={colors.muted}>
                  {l.hint}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <View style={{ marginTop: spacing.lg }}>
          <Button label="shuffle and deal" haptic="medium" disabled={levels.length === 0} onPress={() => void game.begin(levels)} />
        </View>
      </ScrollView>
    );
  }

  const myDraw = game.myTurn;
  const animateDraw = (fn: () => Promise<boolean>) => {
    flip.value = withSequence(withSpring(1, motion.spring), withSpring(0, motion.spring));
    void fn();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
      <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', marginBottom: spacing.lg }}>
        {game.left} cards left in the deck
      </Text>
      <Animated.View style={flipStyle}>
        <Card style={{ minHeight: 220, justifyContent: 'center', marginBottom: spacing.xl }}>
          {game.card ? (
            <>
              <Text variant="caption" color={colors.gold} style={{ textAlign: 'center', marginBottom: spacing.sm }}>
                {KIND_LABEL[game.card.kind]} · {game.card.level}
              </Text>
              <Text variant="title" style={{ textAlign: 'center' }}>
                {game.card.text}
              </Text>
            </>
          ) : (
            <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
              {myDraw ? 'draw the first card' : `${partnerName} draws first…`}
            </Text>
          )}
        </Card>
      </Animated.View>
      {myDraw ? (
        <View>
          <Button label="draw" haptic="medium" onPress={() => animateDraw(game.draw)} />
          <View style={{ marginTop: spacing.sm }}>
            <Button label="pass this one" tone="ghost" onPress={() => animateDraw(game.skip)} />
          </View>
        </View>
      ) : (
        <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
          {partnerName}'s draw — answer honestly ♥
        </Text>
      )}
      {game.lastFailedMove ? (
        <View style={{ marginTop: spacing.lg }}>
          <Button label="that did not send — try again" tone="ghost" onPress={() => void game.retryFailed()} />
        </View>
      ) : null}
    </View>
  );
}
