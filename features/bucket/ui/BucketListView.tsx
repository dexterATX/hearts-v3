// features/bucket/ui/BucketListView.tsx — ideas, vote, done, random picker.
import { useState } from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import { Text, Card, Button, Skeleton } from '../../../ui';
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
    <Card style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="body">{item.title}</Text>
          <Text variant="caption" color={colors.muted}>
            {item.category} {votes > 0 ? `· ${votes === 2 ? 'both of you want this ♥' : 'one vote'}` : ''}
          </Text>
        </View>
        <Pressable onPress={() => void vote(item, !voted)} style={{ padding: spacing.sm }}>
          <Text variant="title">{voted ? '♥️' : '🤍'}</Text>
        </Pressable>
        <Pressable onPress={() => void markDone(item, null)} style={{ padding: spacing.sm }}>
          <Text variant="title">✅</Text>
        </Pressable>
        <Pressable
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
          <Text variant="caption" color={armed ? colors.rose : colors.muted}>
            {armed ? 'sure?' : '✕'}
          </Text>
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
      <View style={{ padding: spacing.lg }}>
        <Skeleton height={64} style={{ marginBottom: spacing.sm }} />
        <Skeleton height={64} />
      </View>
    );
  }

  if (list.error && !list.data) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Card>
          <Text variant="small" color={colors.rose}>
            the list would not load — pull down to try again
          </Text>
        </Card>
      </View>
    );
  }

  const rows = list.data ?? [];
  const open = ranked(rows);
  const done = doneItems(rows);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
      <Card style={{ marginBottom: spacing.lg }}>
        <TextInput
          placeholder="one day, together, we should…"
          placeholderTextColor={colors.muted}
          value={title}
          onChangeText={setTitle}
          style={{
            color: colors.ink,
            fontSize: 15,
            borderBottomWidth: 1,
            borderColor: colors.line,
            paddingVertical: spacing.sm,
            marginBottom: spacing.md,
          }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md }}>
          {CATEGORIES.map((c) => (
            <Pressable key={c} onPress={() => setCategory(c)} style={{ margin: spacing.xs }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: category === c ? colors.rose : colors.line,
                  borderRadius: radius.lg,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.sm,
                }}
              >
                <Text variant="caption" color={category === c ? colors.rose : colors.muted}>
                  {c}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Button label="put it on the list" haptic="medium" disabled={!title.trim()} onPress={() => void add(title, category).then(() => setTitle(''))} />
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.md }}>
        <Button
          label="🎲 pick for us"
          tone="gold"
          onPress={() => setPicked(pickRandom(rows))}
          style={{ marginRight: spacing.sm }}
        />
        <Button
          label={tab === 'open' ? `done (${done.length})` : `open (${open.length})`}
          tone="ghost"
          onPress={() => setTab(tab === 'open' ? 'done' : 'open')}
        />
      </View>

      {picked ? (
        <Card style={{ marginBottom: spacing.lg, borderColor: colors.gold }}>
          <Text variant="caption" color={colors.gold} style={{ marginBottom: spacing.xs }}>
            fate says:
          </Text>
          <Text variant="title">{picked.title}</Text>
          <View style={{ marginTop: spacing.md }}>
            <Button label="sounds perfect" tone="ghost" onPress={() => setPicked(null)} />
          </View>
        </Card>
      ) : null}

      {tab === 'open' ? (
        open.length === 0 ? (
          <Card>
            <Text variant="small" color={colors.muted}>
              the list is empty — dream something up together and put it here.
            </Text>
          </Card>
        ) : (
          open.map((item) => <ItemRow key={item.id} item={item} myId={myId} />)
        )
      ) : done.length === 0 ? (
        <Card>
          <Text variant="small" color={colors.muted}>
            nothing crossed off yet — the first ✅ will feel so good.
          </Text>
        </Card>
      ) : (
        done.map((item) => (
          <Card key={item.id} style={{ marginBottom: spacing.sm, opacity: 0.75 }}>
            <Text variant="body" style={{ textDecorationLine: 'line-through' }}>
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
