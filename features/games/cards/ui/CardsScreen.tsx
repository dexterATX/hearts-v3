// features/games/cards/ui/CardsScreen.tsx — truth or dare · would you rather · 20q.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, interpolate } from 'react-native-reanimated';
import { Text, Button, Card, Icon, Skeleton, SkeletonCard } from '../../../../ui';
import { colors, spacing, motion } from '../../../../theme/theme';
import { useCards } from '../hooks';
import { type CardLevel } from '../rules';
import { usePartnerName } from '../../../../lib/session/store';

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

/** The drawn card should read as a physical object, not as a paragraph. */
const CARD_MIN_HEIGHT = spacing.huge * 5;
/** Past this many characters `display` wraps to five-plus lines — drop a step. */
const LONG_PROMPT = 56;

export function CardsScreen({ sessionId }: { sessionId: string }) {
  const game = useCards(sessionId);
  const partnerName = usePartnerName();
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
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          justifyContent: 'center',
          padding: spacing.xl,
          gap: spacing.xl,
        }}
      >
        <SkeletonCard lines={3} />
        <Skeleton height={spacing.huge} />
      </View>
    );
  }

  const s = game.state;

  if (game.outcome) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          justifyContent: 'center',
          padding: spacing.xl,
          gap: spacing.xl,
        }}
      >
        <Text variant="title" style={{ textAlign: 'center' }}>
          {game.outcome.summary}
        </Text>
        <Button label="shuffle a new deck" size="lg" onPress={() => void game.begin(levels)} />
      </View>
    );
  }

  if (s.phase === 'lobby') {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge }}
      >
        <Text variant="display" style={{ marginBottom: spacing.sm }}>
          pick your levels
        </Text>
        <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.xl }}>
          spicy stays out unless you both want it in — talk first, tap second.
        </Text>
        <View style={{ gap: spacing.sm }}>
          {LEVEL_INFO.map((l) => {
            const on = levels.includes(l.key);
            return (
              <Pressable
                key={l.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() =>
                  setLevels((prev) =>
                    on ? prev.filter((p) => p !== l.key) : [...prev, l.key],
                  )
                }
              >
                <Card
                  variant={on ? 'accent' : 'quiet'}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                >
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Text variant="heading" color={on ? colors.blue : colors.ink}>
                      {l.label}
                    </Text>
                    <Text variant="small" color={colors.muted}>
                      {l.hint}
                    </Text>
                  </View>
                  {on ? <Icon name="check" size={spacing.xl} color={colors.blue} /> : null}
                </Card>
              </Pressable>
            );
          })}
        </View>
        <View style={{ marginTop: spacing.xl }}>
          <Button
            label="shuffle and deal"
            size="lg"
            haptic="medium"
            disabled={levels.length === 0}
            onPress={() => void game.begin(levels)}
          />
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
      <Text
        variant="overline"
        color={colors.muted}
        style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: spacing.lg }}
      >
        {game.left} cards left in the deck
      </Text>
      <Animated.View style={flipStyle}>
        <Card
          variant="raised"
          style={{
            minHeight: CARD_MIN_HEIGHT,
            justifyContent: 'center',
            padding: spacing.xl,
            marginBottom: spacing.xl,
            gap: spacing.lg,
          }}
        >
          {game.card ? (
            <>
              <Text
                variant="overline"
                color={colors.silver}
                style={{ textAlign: 'center', textTransform: 'uppercase' }}
              >
                {KIND_LABEL[game.card.kind]} · {game.card.level}
              </Text>
              <Text
                variant={game.card.text.length > LONG_PROMPT ? 'title' : 'display'}
                style={{ textAlign: 'center' }}
              >
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
        <View style={{ gap: spacing.sm }}>
          <Button label="draw" size="lg" haptic="medium" onPress={() => animateDraw(game.draw)} />
          <Button label="pass this one" tone="ghost" onPress={() => animateDraw(game.skip)} />
        </View>
      ) : (
        <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
          {partnerName}’s draw — answer honestly ♥
        </Text>
      )}
      {game.lastFailedMove ? (
        <Card
          variant="danger"
          style={{ marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <Icon name="alert" size={spacing.lg} color={colors.danger} />
          <Button
            label="that did not send — try again"
            tone="ghost"
            style={{ flex: 1 }}
            onPress={() => void game.retryFailed()}
          />
        </Card>
      ) : null}
    </View>
  );
}
