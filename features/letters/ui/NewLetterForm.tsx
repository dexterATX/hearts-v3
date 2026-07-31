// features/letters/ui/NewLetterForm.tsx — write, seal, choose the lock.
import { useState } from 'react';
import { View, TextInput, ScrollView, Pressable } from 'react-native';
import { Text, Button } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { MOODS } from '../../../lib/moods';
import { useSendLetter } from '../hooks';
import type { LetterLockType } from '../../../lib/db/database.types';

const LOCKS: { key: LetterLockType; hint: string }[] = [
  { key: 'anytime', hint: 'she can open it the moment it lands' },
  { key: 'date', hint: 'sealed until a day you pick' },
  { key: 'mood', hint: 'opens when one of you feels a certain way' },
];

export function NewLetterForm({ onSent }: { onSent: () => void }) {
  const send = useSendLetter();
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl }}>
      <Text variant="title" style={{ marginBottom: spacing.xl }}>
        seal a letter for her
      </Text>

      <TextInput
        placeholder='label — "open when you miss me"'
        placeholderTextColor={colors.muted}
        value={label}
        onChangeText={setLabel}
        style={{
          color: colors.ink,
          fontSize: 17,
          borderBottomWidth: 1,
          borderColor: colors.line,
          paddingVertical: spacing.md,
          marginBottom: spacing.lg,
        }}
      />
      <TextInput
        placeholder="say it like you would out loud…"
        placeholderTextColor={colors.muted}
        value={body}
        onChangeText={setBody}
        multiline
        style={{
          color: colors.ink,
          fontSize: 17,
          minHeight: 180,
          textAlignVertical: 'top',
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: spacing.lg,
          marginBottom: spacing.xl,
        }}
      />

      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.sm }}>
        when can she open it?
      </Text>
      {LOCKS.map((l) => (
        <Pressable key={l.key} onPress={() => setLockType(l.key)} style={{ marginBottom: spacing.sm }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: lockType === l.key ? colors.rose : colors.line,
              borderRadius: radius.md,
              padding: spacing.md,
              backgroundColor: lockType === l.key ? colors.surfaceAlt : colors.surface,
            }}
          >
            <Text variant="body" color={lockType === l.key ? colors.rose : colors.ink}>
              {l.key === 'anytime' ? '💌 anytime' : l.key === 'date' ? '📅 on a date' : '💭 on a feeling'}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {l.hint}
            </Text>
          </View>
        </Pressable>
      ))}

      {lockType === 'date' ? (
        <TextInput
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          value={unlockAt}
          onChangeText={setUnlockAt}
          autoCapitalize="none"
          style={{
            color: colors.ink,
            fontSize: 17,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: spacing.md,
            marginTop: spacing.sm,
          }}
        />
      ) : null}

      {lockType === 'mood' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm }}>
          {MOODS.map((m) => (
            <Pressable key={m.key} onPress={() => setUnlockMood(m.key)} style={{ margin: spacing.xs }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: unlockMood === m.key ? colors.rose : colors.line,
                  borderRadius: radius.lg,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                }}
              >
                <Text variant="small" color={unlockMood === m.key ? colors.rose : colors.ink}>
                  {m.emoji} {m.label}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? (
        <Text variant="small" color={colors.rose} style={{ marginTop: spacing.md }}>
          {error}
        </Text>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        <Button label={busy ? 'sealing…' : 'seal it with a kiss'} haptic="medium" disabled={busy} onPress={() => void submit()} />
      </View>
    </ScrollView>
  );
}
