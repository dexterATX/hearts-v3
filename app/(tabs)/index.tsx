// app/(tabs)/index.tsx — home (§7.2): days-together, her live mood card,
// presence, unread badges, feed. Thin: compose slices, own no logic.
// The feed is the screen's ONE list; everything else rides in its header —
// a FlashList nested in a ScrollView breaks virtualization (round-4 finding).
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../../../theme/theme';
import { useSession } from '../../../lib/session/store';
import { DaysTogether, FeedList, OutboxBanner, useCouple, useFeed, useHomeSync } from '../../../features/home';
import { MoodCard, MoodChips, MoodHistory, useMoods, useMoodSync, useSendMood } from '../../../features/mood';
import { PresenceChip, usePublishPresence } from '../../../features/presence';

export default function HomeTab() {
  usePublishPresence('index');
  useHomeSync();
  useMoodSync();
  const couple = useCouple();
  const feed = useFeed();
  const moods = useMoods();
  const sendMood = useSendMood();
  const partner = useSession((s) => s.partner);
  const myId = useSession((s) => s.userId);
  const meName = useSession((s) => s.me?.nickname || s.me?.display_name || 'you');
  const herName = partner?.nickname || partner?.display_name || 'her';

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <FeedList
        items={feed.items}
        loading={feed.isLoading}
        error={feed.error ? 'the feed would not load' : null}
        names={{ me: meName, her: herName }}
        myId={myId}
        header={
          <>
            <OutboxBanner />
            <View style={{ paddingTop: spacing.md }}>
              <PresenceChip />
            </View>
            <DaysTogether anniversary={couple.data?.anniversary_date ?? null} />
            <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
              <MoodCard rows={moods.data ?? []} partnerId={partner?.id ?? null} partnerName={herName} />
            </View>
            <MoodChips onPick={(k) => void sendMood(k)} />
            <View style={{ height: spacing.lg }} />
            <MoodHistory rows={moods.data ?? []} names={{ me: meName, her: herName }} myId={myId} />
            <View style={{ height: spacing.md }} />
          </>
        }
      />
    </SafeAreaView>
  );
}
