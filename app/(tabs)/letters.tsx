// app/(tabs)/letters.tsx — the sealed pile + the shelf (§7.5).
// NEVER a remaining count. Every state has an exit.
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Text, Button, Card, Skeleton } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import {
  LetterCard,
  sealed,
  shelf,
  useLetters,
  useLetterSync,
  useLetterUnlocked,
} from '../../../features/letters';
import { usePublishPresence } from '../../../features/presence';
import { useSession } from '../../../lib/session/store';
import type { LetterRow } from '../../../lib/db/database.types';

function LetterEntry({ letter, mine }: { letter: LetterRow; mine: boolean }) {
  const unlocked = useLetterUnlocked(letter);
  return (
    <LetterCard
      letter={letter}
      unlocked={unlocked || mine} // authors can always re-read their own
      onPress={() => {
        if (unlocked || mine) router.push(`/letters/${letter.id}`);
      }}
    />
  );
}

export default function LettersTab() {
  usePublishPresence('letters');
  useLetterSync();
  const letters = useLetters();
  const myId = useSession((s) => s.userId) ?? '';

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={{ marginBottom: spacing.lg }}>
          <Button label="seal a new letter" haptic="medium" onPress={() => router.push('/letters/new')} />
        </View>

        {letters.isLoading ? (
          <>
            <Skeleton height={88} style={{ marginBottom: spacing.md }} />
            <Skeleton height={88} />
          </>
        ) : letters.error ? (
          <Card>
            <Text variant="small" color={colors.rose}>
              the letters would not open — pull down to try again
            </Text>
          </Card>
        ) : (letters.data ?? []).length === 0 ? (
          <Card>
            <Text variant="small" color={colors.muted}>
              no letters yet. write the first one and seal it — someday she opens
              it on exactly the right day.
            </Text>
          </Card>
        ) : (
          <>
            {sealed(letters.data ?? []).length > 0 ? (
              <Text variant="caption" color={colors.gold} style={{ marginBottom: spacing.sm }}>
                waiting for the right moment
              </Text>
            ) : null}
            {sealed(letters.data ?? []).map((l) => (
              <LetterEntry key={l.id} letter={l} mine={l.author_id === myId} />
            ))}
            {shelf(letters.data ?? []).length > 0 ? (
              <Text variant="caption" color={colors.muted} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
                the shelf — opened, kept, rereadable
              </Text>
            ) : null}
            {shelf(letters.data ?? []).map((l) => (
              <LetterEntry key={l.id} letter={l} mine={l.author_id === myId} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
