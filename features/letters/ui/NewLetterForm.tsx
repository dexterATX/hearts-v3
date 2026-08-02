// features/letters/ui/NewLetterForm.tsx — write, seal, choose the lock.
import { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text, Button, Card, Input, Icon, MoodBunny } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { MOODS } from '../../../lib/moods';
import { useSendLetter } from '../hooks';
import { usePartnerName } from '../../../lib/session/store';
import type { LetterLockType } from '../../../lib/db/database.types';

// Stays a module constant: only the `anytime` hint needs the name, so it takes
// it at render rather than rebuilding the whole array on every keystroke.
const LOCKS: { key: LetterLockType; label: string; hint: (partnerName: string) => string }[] = [
  { key: 'anytime', label: 'anytime', hint: (n) => `${n} can open it the moment it lands` },
  { key: 'date', label: 'on a date', hint: () => 'sealed until a day you pick' },
  { key: 'mood', label: 'on a feeling', hint: () => 'opens when one of you feels a certain way' },
];

const BODY_MIN_HEIGHT = spacing.huge * 4; // room for a real letter, not a caption

export function NewLetterForm({ onSent }: { onSent: () => void }) {
  const send = useSendLetter();
  const partnerName = usePartnerName();
  const [label, setLabel] = useState('');
  const [body, setBody] = useState('');
  const [lockType, setLockType] = useState<LetterLockType>('anytime');
  const [unlockAt, setUnlockAt] = useState(''); // YYYY-MM-DD
  const [unlockMood, setUnlockMood] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!label.trim() || !body.trim()) {
      setError('give it a label and a few words — even two lines counts');
      return;
    }
    if (lockType === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(unlockAt)) {
        setError('the date looks off — use YYYY-MM-DD');
        return;
      }
      if (new Date(unlockAt) <= new Date()) {
        setError('pick a day still ahead of you');
        return;
      }
    }
    if (lockType === 'mood' && !unlockMood) {
      setError('pick the feeling that opens it');
      return;
    }
    setBusy(true);
    try {
      await send({
        label: label.trim(),
        body: body.trim(),
        lockType,
        unlockAt: lockType === 'date' ? new Date(`${unlockAt}T00:00:00`).toISOString() : null,
        unlockMood: lockType === 'mood' ? unlockMood : null,
        audioStoragePath: null,
      });
      onSent();
    } finally {
      setBusy(false);
    }
  };

  const activeLock = LOCKS.find((l) => l.key === lockType);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge, gap: spacing.xl }}
    >
      <Text variant="display">seal a letter for {partnerName}</Text>

      <View style={{ gap: spacing.lg }}>
        <Input
          placeholder='label — "open when you miss me"'
          value={label}
          onChangeText={setLabel}
        />
        <Input
          placeholder="say it like you would out loud…"
          value={body}
          onChangeText={setBody}
          multiline
          style={{ minHeight: BODY_MIN_HEIGHT, textAlignVertical: 'top' }}
        />
      </View>

      <View>
        <Text
          variant="overline"
          color={colors.muted}
          style={{ textTransform: 'uppercase', marginBottom: spacing.md }}
        >
          when can {partnerName} open it?
        </Text>

        {/* segmented control — one blue segment, the rest glass */}
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.xs,
            padding: spacing.xs,
            borderRadius: radius.md,
            borderWidth: 3,
            borderColor: colors.line,
            backgroundColor: colors.surfaceAlt,
          }}
        >
          {LOCKS.map((l) => {
            const on = lockType === l.key;
            return (
              <Pressable
                key={l.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setLockType(l.key)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.xs,
                  borderRadius: radius.sm,
                  borderWidth: 3,
                  borderColor: on ? colors.blue : 'transparent',
                  backgroundColor: on ? colors.blueSoft : 'transparent',
                }}
              >
                <Text
                  variant="small"
                  weight={on ? 'semibold' : 'regular'}
                  color={on ? colors.ink : colors.muted}
                >
                  {l.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeLock ? (
          <Text variant="caption" color={colors.muted} style={{ marginTop: spacing.md }}>
            {activeLock.hint(partnerName)}
          </Text>
        ) : null}

        {lockType === 'date' ? (
          <View style={{ marginTop: spacing.lg }}>
            <Input
              placeholder="YYYY-MM-DD"
              value={unlockAt}
              onChangeText={setUnlockAt}
              autoCapitalize="none"
            />
          </View>
        ) : null}

        {lockType === 'mood' ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm,
              marginTop: spacing.lg,
            }}
          >
            {MOODS.map((m) => {
              const on = unlockMood === m.key;
              return (
                <Pressable
                  key={m.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setUnlockMood(m.key)}
                  style={{
                    borderWidth: 3,
                    borderColor: on ? colors.blue : colors.line,
                    backgroundColor: on ? colors.blueSoft : colors.surface,
                    borderRadius: radius.pill,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <MoodBunny mood={m.key} size={18} />
                  <Text variant="small" color={on ? colors.blue : colors.ink}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {error ? (
        <Card variant="danger">
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Icon name="alert" size={18} color={colors.danger} />
            <Text
              variant="small"
              color={colors.danger}
              accessibilityLiveRegion="polite"
              style={{ flex: 1 }}
            >
              {error}
            </Text>
          </View>
        </Card>
      ) : null}

      <Button
        label="seal it with a kiss"
        tone="primary"
        size="lg"
        icon="lock"
        haptic="medium"
        loading={busy}
        disabled={busy}
        onPress={() => void submit()}
      />
    </ScrollView>
  );
}
