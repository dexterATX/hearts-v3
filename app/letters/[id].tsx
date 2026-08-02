// app/letters/[id].tsx — the reading room: seal break → unfold → body.
// Thin route; WaxSeal owns the moment, the slice owns the data.
import { View, ScrollView } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text, Card, Icon, Skeleton, SkeletonCard } from '../../ui';
import { colors, spacing } from '../../theme/theme';
import {
  WaxSeal,
  useLetters,
  useOpenLetter,
  useLetterUnlocked,
  useLetterBody,
  type LetterListRow,
} from '../../features/letters';
import { usePublishPresence } from '../../features/presence';
import { useSession, usePartnerName } from '../../lib/session/store';

export default function LetterRoute() {
  usePublishPresence('letters');
  const { id } = useLocalSearchParams<{ id: string }>();
  const letters = useLetters();
  const openLetter = useOpenLetter();
  const myId = useSession((s) => s.userId) ?? '';

  const letter = (letters.data ?? []).find((l) => l.id === id);

  if (letters.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg }}>
        <Skeleton width="60%" height={28} />
        <SkeletonCard lines={5} />
      </View>
    );
  }

  if (!letter) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Card variant="quiet" style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
          <Icon name="letter" size={28} color={colors.faint} />
          <Text
            variant="body"
            color={colors.muted}
            style={{ textAlign: 'center', marginTop: spacing.lg }}
          >
            this letter seems to have drifted away — it may have been a ghost of a
            connection hiccup. it will sort itself out.
          </Text>
        </Card>
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
  letter: LetterListRow;
  openLetter: ReturnType<typeof useOpenLetter>;
  myId: string;
}) {
  // hooks before any branching, on a REAL letter — no `as never` placeholder
  const unlocked = useLetterUnlocked(letter);
  const partnerName = usePartnerName();
  // openLetter writes opened_at to the cache synchronously, which would flip
  // `alreadyOpen` mid-break and skip WaxSeal's unfold animation entirely —
  // gate on who opened it so the moment survives (context review finding)
  const [justOpenedByMe, setJustOpenedByMe] = useState(false);

  const mine = letter.author_id === myId;
  const alreadyOpen = (!!letter.opened_at || mine) && !justOpenedByMe;

  // the text lives on the server until the seal is genuinely broken (0008);
  // only ask for it once this screen is entitled to show it
  const body = useLetterBody(letter.id, alreadyOpen || unlocked);
  const text = body.isLoading ? '…' : (body.data ?? (body.error ? 'this one is still sealed' : ''));

  // the words themselves, or their shape while they are still coming down
  const prose = body.isLoading ? (
    <View style={{ gap: spacing.md }}>
      <Skeleton height={14} />
      <Skeleton height={14} />
      <Skeleton width="70%" height={14} />
    </View>
  ) : (
    <Text variant="body">{text}</Text>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {alreadyOpen ? (
        <View style={{ gap: spacing.xl, paddingVertical: spacing.lg }}>
          <Text variant="title">{letter.label}</Text>
          <Card variant="raised" style={{ padding: spacing.xl }}>
            {prose}
          </Card>
          {letter.audio_url ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Icon name="mic" size={16} color={colors.silver} />
              <Text variant="caption" color={colors.muted} style={{ flex: 1 }}>
                this one has {mine ? 'your' : `${partnerName}’s`} voice in it — find it under voice notes
              </Text>
            </View>
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
          {prose}
        </WaxSeal>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <Icon name="lock" size={32} color={colors.silver} />
          <Text
            variant="title"
            style={{ textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.md }}
          >
            still sealed
          </Text>
          <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
            not yet. when the moment is right, the seal breaks itself.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
