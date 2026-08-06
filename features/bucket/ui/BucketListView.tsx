// features/bucket/ui/BucketListView.tsx — ideas, vote, done, random picker.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Text, Card, Button, Input, Icon, SkeletonCard } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { useBucketList, useBucketActions } from '../hooks';
import { ranked, doneItems, hasVoted, voteCount, pickRandom, CATEGORIES } from '../model';
import { useSession } from '../../../lib/session/store';
import type { BucketItemRow } from '../../../lib/db/database.types';

function ItemRow({ item, myId }: { item: BucketItemRow; myId: string }) {
  const { vote, markDone, remove } = useBucketActions();
  const [armed, setArmed] = useState(false);
  const voted = hasVoted(item, myId);
  const votes = voteCount(item);

  return (
    <Card variant={votes === 2 ? 'accent' : 'quiet'} style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="heading">{item.title}</Text>
          <Text variant="caption" color={colors.muted}>
            {item.category} {votes > 0 ? `· ${votes === 2 ? 'both of you want this ♥' : 'one vote'}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="vote for this"
          accessibilityState={{ selected: voted }}
          onPress={() => void vote(item, !voted)}
          style={{ padding: spacing.sm }}
        >
          <Icon name="heart" size={spacing.xl} color={voted ? colors.blue : colors.faint} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="cross it off"
          onPress={() => void markDone(item, null)}
          style={{ padding: spacing.sm }}
        >
          <Icon name="check" size={spacing.xl} color={colors.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="remove it"
          onPress={() => {
            if (!armed) {
              setArmed(true);
              setTimeout(() => setArmed(false), 3000);
              return;
            }
            void remove(item);
          }}
          style={{ padding: spacing.sm }}
        >
          {armed ? (
            <Text variant="caption" color={colors.danger}>
              sure?
            </Text>
          ) : (
            <Icon name="close" size={spacing.lg} color={colors.muted} />
          )}
        </Pressable>
      </View>
    </Card>
  );
}

export function BucketListView() {
  const list = useBucketList();
  const { add } = useBucketActions();
  const myId = useSession((s) => s.userId) ?? '';
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [picked, setPicked] = useState<BucketItemRow | null>(null);
  const [tab, setTab] = useState<'open' | 'done'>('open');

  if (list.isLoading) {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
      </View>
    );
  }

  if (list.error && !list.data) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Card variant="danger" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Icon name="alert" size={spacing.xl} color={colors.danger} />
          <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
            the list would not load, pull down to try again
          </Text>
        </Card>
      </View>
    );
  }

  const rows = list.data ?? [];
  const open = ranked(rows);
  const done = doneItems(rows);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <Card style={{ marginBottom: spacing.xl, gap: spacing.lg }}>
        <Input placeholder="one day, together, we should…" value={title} onChangeText={setTitle} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setCategory(c)}
              >
                <View
                  style={{
                    borderWidth: 3,
                    borderColor: active ? colors.blue : colors.line,
                    backgroundColor: active ? colors.blueSoft : 'transparent',
                    borderRadius: radius.pill,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <Text variant="caption" color={active ? colors.blue : colors.muted}>
                    {c}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Button
          label="put it on the list"
          haptic="medium"
          disabled={!title.trim()}
          onPress={() => void add(title, category).then(() => setTitle(''))}
        />
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xl }}>
        <Button label="pick for us" tone="secondary" icon="sparkle" onPress={() => setPicked(pickRandom(rows))} />
        <Button
          label={tab === 'open' ? `done (${done.length})` : `open (${open.length})`}
          tone="ghost"
          onPress={() => setTab(tab === 'open' ? 'done' : 'open')}
        />
      </View>

      {picked ? (
        <Card variant="accent" style={{ marginBottom: spacing.xl, gap: spacing.md }}>
          <Text variant="overline" color={colors.blue} style={{ textTransform: 'uppercase' }}>
            fate says:
          </Text>
          <Text variant="title">{picked.title}</Text>
          <Button label="sounds perfect" tone="ghost" onPress={() => setPicked(null)} />
        </Card>
      ) : null}

      <Text
        variant="overline"
        color={colors.muted}
        style={{ marginBottom: spacing.md, textTransform: 'uppercase' }}
      >
        {tab === 'open' ? 'open' : 'done'}
      </Text>

      {tab === 'open' ? (
        open.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
            <Icon name="sparkle" size={spacing.xxl} color={colors.muted} />
            <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
              the list is empty. dream something up together and put it here.
            </Text>
          </Card>
        ) : (
          open.map((item) => <ItemRow key={item.id} item={item} myId={myId} />)
        )
      ) : done.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
          <Icon name="check" size={spacing.xxl} color={colors.muted} />
          <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
            nothing crossed off yet. the first ✅ will feel so good.
          </Text>
        </Card>
      ) : (
        done.map((item) => (
          <Card key={item.id} variant="quiet" style={{ marginBottom: spacing.sm, gap: spacing.xs }}>
            <Text variant="body" color={colors.muted} style={{ textDecorationLine: 'line-through' }}>
              {item.title}
            </Text>
            <Text variant="caption" color={colors.muted}>
              done {item.done_at ? new Date(item.done_at).toLocaleDateString() : ''}
            </Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
