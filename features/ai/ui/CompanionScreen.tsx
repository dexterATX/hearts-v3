// features/ai/ui/CompanionScreen.tsx — date ideas, poem drafts, quiz, recap.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text, Card, Button, Input, Icon, Skeleton } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { useCompanion } from '../hooks';
import { MODES, type CompanionMode } from '../model';

/** ~60 characters at body size: past this, long prose stops being readable. */
const PROSE_MEASURE = spacing.huge * 12;
/** A text area you can actually draft in, rather than a single-line slot. */
const CONTEXT_MIN_HEIGHT = spacing.huge * 2;
/** Ragged widths so the waiting state reads as prose, not as a progress bar. */
const STREAM_SKELETON: `${number}%`[] = ['96%', '88%', '100%', '72%'];

export function CompanionScreen() {
  const companion = useCompanion();
  const [mode, setMode] = useState<CompanionMode>('date-ideas');
  const [context, setContext] = useState('');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(companion.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge }}
    >
      <Text variant="title" style={{ marginBottom: spacing.sm }}>
        the companion
      </Text>
      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.xl, maxWidth: PROSE_MEASURE }}>
        a quiet helper for the two of you — ideas, drafts, questions, recaps.
        it never posts anything; what it writes is yours to shape.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl }}>
        {MODES.map((m) => {
          const on = mode === m.key;
          return (
            <Pressable
              key={m.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setMode(m.key)}
            >
              <View
                style={{
                  borderWidth: 3,
                  borderColor: on ? colors.blue : colors.line,
                  borderRadius: radius.pill,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.lg,
                  backgroundColor: on ? colors.blueSoft : colors.surface,
                }}
              >
                <Text variant="small" weight={on ? 'semibold' : 'regular'} color={on ? colors.blue : colors.ink}>
                  {m.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.sm }}>
        {MODES.find((m) => m.key === mode)?.hint}
      </Text>
      <Input
        placeholder="a little context (optional)…"
        value={context}
        onChangeText={setContext}
        multiline
        style={{ minHeight: CONTEXT_MIN_HEIGHT, textAlignVertical: 'top' }}
      />

      <View style={{ marginTop: spacing.xl }}>
        {companion.streaming ? (
          <Button label="hold on, stop it" tone="secondary" icon="close" onPress={companion.stop} />
        ) : (
          <Button
            label="ask"
            size="lg"
            icon="sparkle"
            haptic="medium"
            onPress={() => companion.ask(mode, context)}
          />
        )}
      </View>

      {companion.error ? (
        <Card
          variant="danger"
          style={{ marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <Icon name="alert" size={spacing.lg} color={colors.danger} />
          <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
            {companion.error}
          </Text>
        </Card>
      ) : null}

      {companion.streaming && !companion.text ? (
        <Card style={{ marginTop: spacing.xl, gap: spacing.md }}>
          {STREAM_SKELETON.map((w, i) => (
            <Skeleton key={i} width={w} />
          ))}
        </Card>
      ) : null}

      {companion.text ? (
        <Card style={{ marginTop: spacing.xl, padding: spacing.xl, gap: spacing.xl }}>
          <Text variant="body" style={{ maxWidth: PROSE_MEASURE }}>
            {companion.text}
            {companion.streaming ? <Text color={colors.blue}>▌</Text> : null}
          </Text>
          {!companion.streaming ? (
            <Button
              label={copied ? 'copied ♥' : 'copy it'}
              tone="secondary"
              icon={copied ? 'check' : undefined}
              onPress={() => void copy()}
            />
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}
