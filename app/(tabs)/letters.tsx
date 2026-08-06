// app/(tabs)/letters.tsx — the sealed pile + the shelf (§7.5).
// NEVER a remaining count. Every state has an exit.
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Text, Button, Card, Icon, SkeletonCard } from '../../ui';
import { colors, spacing } from '../../theme/theme';
import {
  LetterCard,
  sealed,
  shelf,
  useLetters,
  useLetterSync,
  useLetterUnlocked,
} from '../../features/letters';
import { usePublishPresence } from '../../features/presence';
import { useSession } from '../../lib/session/store';
import type { LetterListRow } from '../../features/letters';

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      variant="overline"
      color={colors.muted}
      style={{ textTransform: 'uppercase', marginBottom: spacing.md }}
    >
      {children}
    </Text>
  );
}

function LetterEntry({ letter, mine }: { letter: LetterListRow; mine: boolean }) {
  const unlocked = useLetterUnlocked(letter);
  return (
    <LetterCard
      letter={letter}
      unlocked={unlocked || mine} // authors can always re-read their own
      mine={mine}
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
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing.huge,
          gap: spacing.xl,
        }}
      >
        <Button
          label="seal a new letter"
          tone="primary"
          size="lg"
          icon="letter"
          haptic="medium"
          onPress={() => router.push('/letters/new')}
        />

        {letters.isLoading ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        ) : letters.error ? (
          <Card variant="danger">
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Icon name="alert" size={18} color={colors.danger} />
              <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
                the letters would not open, pull down to try again
              </Text>
            </View>
          </Card>
        ) : (letters.data ?? []).length === 0 ? (
          <Card variant="quiet" style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
            <Icon name="letter" size={28} color={colors.faint} />
            <Text
              variant="small"
              color={colors.muted}
              style={{ marginTop: spacing.lg, textAlign: 'center' }}
            >
              no letters yet. write the first one and seal it. someday it opens
              on exactly the right day.
            </Text>
          </Card>
        ) : (
          <>
            {sealed(letters.data ?? []).length > 0 ? (
              <View>
                <SectionLabel>waiting for the right moment</SectionLabel>
                {sealed(letters.data ?? []).map((l) => (
                  <LetterEntry key={l.id} letter={l} mine={l.author_id === myId} />
                ))}
              </View>
            ) : null}
            {shelf(letters.data ?? []).length > 0 ? (
              <View>
                <SectionLabel>the shelf: opened, kept, rereadable</SectionLabel>
                {shelf(letters.data ?? []).map((l) => (
                  <LetterEntry key={l.id} letter={l} mine={l.author_id === myId} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
