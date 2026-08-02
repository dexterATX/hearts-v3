// features/games/hangman/ui/HangmanScreen.tsx — the daisy, six petals.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Text, Button, Card, Input, Icon, Skeleton, SkeletonCard } from '../../../../ui';
import { colors, spacing, radius } from '../../../../theme/theme';
import { useHangman } from '../hooks';
import { PETALS } from '../rules';
import { usePartnerName } from '../../../../lib/session/store';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

/** The daisy is CONTENT, not chrome — the petals are the game. */
function Daisy({ petals }: { petals: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.xs,
        marginVertical: spacing.xl,
      }}
    >
      {Array.from({ length: PETALS }).map((_, i) => (
        <Text key={i} variant="display" style={{ opacity: i < petals ? 1 : 0.15 }}>
          🌼
        </Text>
      ))}
    </View>
  );
}

/** Every failed move reads the same: what went wrong, then the way out. */
function FailureNotice({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <Card variant="danger" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Icon name="alert" size={spacing.lg} color={colors.danger} />
        <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
          {message}
        </Text>
      </View>
      {onRetry && retryLabel ? <Button label={retryLabel} tone="ghost" onPress={onRetry} /> : null}
    </Card>
  );
}

export function HangmanScreen({ sessionId }: { sessionId: string }) {
  const game = useHangman(sessionId);
  const partnerName = usePartnerName();
  const [word, setWord] = useState('');

  if (game.loading || !game.state) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.xl }}>
        <Skeleton height={spacing.huge} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </View>
    );
  }

  const s = game.state;

  if (game.outcome) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Daisy petals={s.petals} />
        <Text variant="title" style={{ textAlign: 'center' }}>
          {game.outcome.summary}
        </Text>
        <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: spacing.xl }}>
          every game ends with an exit — head back whenever you like
        </Text>
      </View>
    );
  }

  if (s.phase === 'setting') {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge, gap: spacing.xl }}
      >
        <View style={{ gap: spacing.sm }}>
          <Text variant="title">pick a word for {partnerName}</Text>
          <Text variant="small" color={colors.muted}>
            it never leaves your phone — only you will ever see it. {partnerName} gets a daisy and six
            petals.
          </Text>
        </View>

        <Input
          placeholder="one word, letters only"
          autoCapitalize="none"
          autoCorrect={false}
          value={word}
          onChangeText={setWord}
        />

        <Button
          label="hide it in the daisy"
          size="lg"
          haptic="medium"
          disabled={!/^[a-zA-Z]+$/.test(word.trim())}
          onPress={() => void game.commitWord(word)}
        />

        {game.lastFailedMove ? (
          <FailureNotice
            message={`that did not reach ${partnerName}’s phone — check your signal and try again`}
          />
        ) : null}
      </ScrollView>
    );
  }

  const masked = s.revealed.map((r) => r ?? '_').join(' ');
  const iGuess = !game.iAmSetter;
  // a verdict is owed iff a tried letter is still unresolved — lastGuessBy
  // alone can't tell you (it stays set after the verdict lands)
  const waitingOnSetter = s.tried.length > s.resolved.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
      <Daisy petals={s.petals} />

      <Card variant="raised" style={{ marginBottom: spacing.xl }}>
        {/* the blanks are already space-separated — no extra tracking needed */}
        <Text variant="title" style={{ textAlign: 'center' }}>
          {masked}
        </Text>
        <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: spacing.md }}>
          {s.tried.length > 0 ? `tried: ${s.tried.join(' ')}` : 'no letters tried yet'}
        </Text>
      </Card>

      {game.iAmSetter ? (
        <Text variant="body" weight="medium" color={colors.blue} style={{ textAlign: 'center' }}>
          {waitingOnSetter
            ? `resolving ${partnerName}’s guess…`
            : `${partnerName} is guessing — watch it happen live`}
        </Text>
      ) : iGuess && !waitingOnSetter ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: spacing.xs,
          }}
        >
          {ALPHABET.map((letter) => {
            const used = s.tried.includes(letter);
            return (
              <Pressable
                key={letter}
                accessibilityRole="button"
                accessibilityState={{ disabled: used }}
                disabled={used}
                onPress={() => void game.guess(letter)}
              >
                <View
                  style={{
                    width: spacing.xxl,
                    height: spacing.xxl + spacing.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.sm,
                    borderWidth: 3,
                    borderColor: colors.line,
                    backgroundColor: used ? 'transparent' : colors.surfaceAlt,
                  }}
                >
                  <Text
                    variant="body"
                    weight={used ? 'regular' : 'medium'}
                    color={used ? colors.faint : colors.ink}
                  >
                    {letter}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
          waiting on {partnerName}’s phone…
        </Text>
      )}

      {game.lastFailedMove ? (
        <View style={{ marginTop: spacing.xl }}>
          <FailureNotice
            message={`your letter did not reach ${partnerName}’s phone`}
            retryLabel="try again"
            onRetry={() => void game.retryFailed()}
          />
        </View>
      ) : null}
    </View>
  );
}
