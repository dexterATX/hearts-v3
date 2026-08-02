// app/(tabs)/index.tsx — home (§7.2): days-together, your partner's live mood
// card, presence, unread badges, feed. Thin: compose slices, own no logic.
// The feed is the screen's ONE list; everything else rides in its header —
// a FlashList nested in a ScrollView breaks virtualization (round-4 finding).
//
// Layout is one column with spacing.xl between sections: the header stack is
// where the screen breathes, and a null slice (no presence, empty outbox)
// simply drops out of the gap rather than leaving a hole.
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../../theme/theme';
import { useSession, usePartnerName } from '../../lib/session/store';
import { DaysTogether, FeedList, OutboxBanner, useCouple, useFeed, useHomeSync } from '../../features/home';
import { MoodCard, MoodChips, MoodHistory, useMoods, useMoodSync, useSendMood } from '../../features/mood';
import { PresenceChip, usePublishPresence } from '../../features/presence';

export default function HomeTab() {
  usePublishPresence('index');
  useHomeSync();
  useMoodSync();
  const couple = useCouple();
  const feed = useFeed();
  const moods = useMoods();
  const sendMood = useSendMood();
  const partnerId = useSession((s) => s.partner?.id ?? null);
  const myId = useSession((s) => s.userId);
  const partnerName = usePartnerName();

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <FeedList
        items={feed.items}
        loading={feed.isLoading}
        error={feed.error ? 'the feed would not load' : null}
        partnerName={partnerName}
        myId={myId}
        header={
          <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl }}>
            <OutboxBanner />
            <PresenceChip />
            <DaysTogether anniversary={couple.data?.anniversary_date ?? null} />
            <View style={{ paddingHorizontal: spacing.lg }}>
              <MoodCard rows={moods.data ?? []} partnerId={partnerId} partnerName={partnerName} />
            </View>
            <MoodChips onPick={(k) => void sendMood(k)} />
            <MoodHistory rows={moods.data ?? []} partnerName={partnerName} myId={myId} />
          </View>
        }
      />
    </SafeAreaView>
  );
}
