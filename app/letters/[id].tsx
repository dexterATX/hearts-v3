// app/letters/[id].tsx — the reading room: seal break → unfold → body.
// Thin route; WaxSeal owns the moment, the slice owns the data.
import { View, ScrollView } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text, Skeleton } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import {
  WaxSeal,
  useLetters,
  useOpenLetter,
  useLetterUnlocked,
} from '../../../features/letters';
import { usePublishPresence } from '../../../features/presence';
import { useSession } from '../../../lib/session/store';
import type { LetterRow } from '../../../lib/db/database.types';

export default function LetterRoute() {
  usePublishPresence('letters');
  const { id } = useLocalSearchParams<{ id: string }>();
  const letters = useLetters();
  const openLetter = useOpenLetter();
  const myId = useSession((s) => s.userId) ?? '';

  const letter = (letters.data ?? []).find((l) => l.id === id);

  if (letters.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
        <Skeleton height={200} />
      </View>
    );
  }

  if (!letter) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
          this letter seems to have drifted away — it may have been a ghost of a
          connection hiccup. it will sort itself out.
        </Text>
      </View>
    );
  }

  return <LetterBody letter={letter} openLetter={openLetter} myId={myId} />;
}

function LetterBody({
  letter,
  openLetter,
  myId,
}: {
  letter: LetterRow;
  openLetter: ReturnType<typeof useOpenLetter>;
  myId: string;
}) {
  // hooks before any branching, on a REAL letter — no `as never` placeholder
  const unlocked = useLetterUnlocked(letter);
  // openLetter writes opened_at to the cache synchronously, which would flip
  // `alreadyOpen` mid-break and skip WaxSeal's unfold animation entirely —
  // gate on who opened it so the moment survives (context review finding)
  const [justOpenedByMe, setJustOpenedByMe] = useState(false);

  const mine = letter.author_id === myId;
  const alreadyOpen = (!!letter.opened_at || mine) && !justOpenedByMe;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {alreadyOpen ? (
        <View style={{ padding: spacing.lg }}>
          <Text variant="caption" color={colors.gold} style={{ marginBottom: spacing.md }}>
            {letter.label}
          </Text>
          <Text variant="body" style={{ lineHeight: 28 }}>
            {letter.body}
          </Text>
          {letter.audio_url ? (
            <Text variant="caption" color={colors.muted} style={{ marginTop: spacing.lg }}>
              🎧 this one has his voice in it — find it under voice notes
            </Text>
          ) : null}
        </View>
      ) : unlocked ? (
        <WaxSeal
          label={letter.label}
          onBreak={async () => {
            const okOpen = await openLetter(letter);
            if (okOpen) setJustOpenedByMe(true);
            return okOpen;
          }}
        >
          <Text variant="body" style={{ lineHeight: 28 }}>
            {letter.body}
          </Text>
        </WaxSeal>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl }}>
          <Text variant="title" style={{ textAlign: 'center', marginBottom: spacing.md }}>
            still sealed 🔏
          </Text>
          <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
            not yet. when the moment is right, the seal breaks itself.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
