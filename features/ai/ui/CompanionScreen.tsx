// features/ai/ui/CompanionScreen.tsx — date ideas, poem drafts, quiz, recap.
import { useState } from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text, Card, Button } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { useCompanion } from '../hooks';
import { MODES, type CompanionMode } from '../model';

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
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl }}>
      <Text variant="title" style={{ marginBottom: spacing.sm }}>
        the companion
      </Text>
      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.xl }}>
        a quiet helper for the two of you — ideas, drafts, questions, recaps.
        it never posts anything; what it writes is yours to shape.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg }}>
        {MODES.map((m) => (
          <Pressable key={m.key} onPress={() => setMode(m.key)} style={{ margin: spacing.xs }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: mode === m.key ? colors.rose : colors.line,
                borderRadius: radius.lg,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                backgroundColor: mode === m.key ? colors.surfaceAlt : colors.surface,
              }}
            >
              <Text variant="small" color={mode === m.key ? colors.rose : colors.ink}>
                {m.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Text variant="caption" color={colors.muted} style={{ marginBottom: spacing.sm }}>
        {MODES.find((m) => m.key === mode)?.hint}
      </Text>
      <TextInput
        placeholder="a little context (optional)…"
        placeholderTextColor={colors.muted}
        value={context}
        onChangeText={setContext}
        multiline
        style={{
          color: colors.ink,
          fontSize: 15,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: spacing.md,
          minHeight: 60,
          textAlignVertical: 'top',
          marginBottom: spacing.lg,
        }}
      />

      {companion.streaming ? (
        <Button label="hold on, stop it" tone="ghost" onPress={companion.stop} />
      ) : (
        <Button label="ask" haptic="medium" onPress={() => companion.ask(mode, context)} />
      )}

      {companion.error ? (
        <Text variant="small" color={colors.rose} style={{ marginTop: spacing.md }}>
          {companion.error}
        </Text>
      ) : null}

      {companion.text ? (
        <Card style={{ marginTop: spacing.xl }}>
          <Text variant="body" style={{ marginBottom: spacing.lg }}>
            {companion.text}
            {companion.streaming ? '▌' : ''}
          </Text>
          {!companion.streaming ? (
            <Button label={copied ? 'copied ♥' : 'copy it'} tone="ghost" onPress={() => void copy()} />
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}
