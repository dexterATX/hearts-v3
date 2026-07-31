// features/games/hangman/ui/HangmanScreen.tsx — the daisy, six petals.
import { useState } from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import { Text, Button, Card, Skeleton } from '../../../../ui';
import { colors, spacing, radius } from '../../../../theme/theme';
import { useHangman } from '../hooks';
import { PETALS } from '../rules';
import { useSession } from '../../../../lib/session/store';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

function Daisy({ petals }: { petals: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: spacing.lg }}>
      {Array.from({ length: PETALS }).map((_, i) => (
        <Text key={i} variant="display" style={{ opacity: i < petals ? 1 : 0.15 }}>
          🌼
        </Text>
      ))}
    </View>
  );
}

export function HangmanScreen({ sessionId }: { sessionId: string }) {
  const game = useHangman(sessionId);
  const partnerName = useSession((s) => s.partner?.nickname || s.partner?.display_name || 'her');
  const [word, setWord] = useState('');

  if (game.loading || !game.state) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
        <Skeleton height={40} style={{ marginBottom: spacing.lg }} />
        <Skeleton height={200} />
      </View>
    );
  }

  const s = game.state;

  if (game.outcome) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Daisy petals={s.petals} />
        <Text variant="title" style={{ textAlign: 'center', marginBottom: spacing.xl }}>
          {game.outcome.summary}
        </Text>
        <Text variant="caption" color={colors.muted} style={{ textAlign: 'center' }}>
          every game ends with an exit — head back whenever you like
        </Text>
      </View>
    );
  }

  if (s.phase === 'setting') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl }}>
        <Text variant="title" style={{ marginBottom: spacing.md }}>
          pick a word for {partnerName}
        </Text>
        <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.xl }}>
          it never leaves your phone — only you will ever see it. she gets a daisy and six petals.
        </Text>
        <TextInput
          placeholder="one word, letters only"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          value={word}
          onChangeText={setWord}
          style={{
            color: colors.ink,
            fontSize: 24,
            letterSpacing: 4,
            textAlign: 'center',
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: spacing.lg,
            marginBottom: spacing.xl,
          }}
        />
        <Button
          label="hide it in the daisy"
          haptic="medium"
          disabled={!/^[a-zA-Z]+$/.test(word.trim())}
          onPress={() => void game.commitWord(word)}
        />
        {game.lastFailedMove ? (
          <Text variant="small" color={colors.rose} style={{ marginTop: spacing.md }}>
            that did not reach her phone — check your signal and try again
          </Text>
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
      <Card style={{ marginBottom: spacing.xl }}>
        <Text variant="title" style={{ textAlign: 'center', letterSpacing: 6 }}>
          {masked}
        </Text>
        <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: spacing.sm }}>
          {s.tried.length > 0 ? `tried: ${s.tried.join(' ')}` : 'no letters tried yet'}
        </Text>
      </Card>

      {game.iAmSetter ? (
        <Text variant="body" color={colors.gold} style={{ textAlign: 'center' }}>
          {waitingOnSetter
            ? 'resolving her guess…'
            : `${partnerName} is guessing — watch it happen live`}
        </Text>
      ) : iGuess && !waitingOnSetter ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
          {ALPHABET.map((letter) => {
            const used = s.tried.includes(letter);
            return (
              <Pressable
                key={letter}
                disabled={used}
                onPress={() => void game.guess(letter)}
                style={{ margin: 3 }}
              >
                <View
                  style={{
                    width: 34,
                    height: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: used ? colors.surface : colors.line,
                    backgroundColor: used ? colors.surface : colors.surfaceAlt,
                    opacity: used ? 0.35 : 1,
                  }}
                >
                  <Text variant="body" color={used ? colors.muted : colors.ink}>
                    {letter}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
          waiting on the setter's phone…
        </Text>
      )}

      {game.lastFailedMove ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text variant="small" color={colors.rose} style={{ textAlign: 'center', marginBottom: spacing.sm }}>
            your letter did not reach her phone
          </Text>
          <Button label="try again" tone="ghost" onPress={() => void game.retryFailed()} />
        </View>
      ) : null}
    </View>
  );
}
