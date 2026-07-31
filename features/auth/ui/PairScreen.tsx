// features/auth/ui/PairScreen.tsx — 6-char invite code, both join orders (§7.1).
import { useState } from 'react';
import { View, TextInput } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text, Button, Card } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { usePairing } from '../hooks';
import { isValidInviteCode, normalizeInviteCode } from '../model';

export function PairScreen() {
  const { create, join, busy } = usePairing();
  const [myCode, setMyCode] = useState<string | null>(null);
  const [theirCode, setTheirCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onCreate = async () => {
    setError(null);
    const res = await create(name.trim() || 'me');
    if (res.ok) setMyCode(res.data.code);
    else setError(res.error.message);
  };

  const onJoin = async () => {
    setError(null);
    if (!isValidInviteCode(theirCode)) {
      setError('codes are six letters and numbers — check each one');
      return;
    }
    const res = await join(normalizeInviteCode(theirCode));
    if (!res.ok) setError(res.error.message);
  };

  const onCopy = async () => {
    if (!myCode) return;
    await Clipboard.setStringAsync(myCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
      <Text variant="title" style={{ textAlign: 'center', marginBottom: spacing.xxl }}>
        become us
      </Text>

      {myCode ? (
        <Card style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.md }}>
            send her this code — it is only ours
          </Text>
          <Text
            variant="display"
            color={colors.rose}
            style={{ letterSpacing: 8, marginBottom: spacing.lg }}
          >
            {myCode}
          </Text>
          <Button label={copied ? 'copied ♥' : 'copy it'} tone="ghost" onPress={() => void onCopy()} />
          <Text variant="caption" color={colors.muted} style={{ marginTop: spacing.lg }}>
            waiting for her to join… this screen updates itself
          </Text>
        </Card>
      ) : (
        <Card style={{ marginBottom: spacing.xl }}>
          <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.sm }}>
            start us — you will get a code to send her
          </Text>
          <TextInput
            placeholder="what should she call you?"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            style={{
              color: colors.ink,
              borderBottomWidth: 1,
              borderColor: colors.line,
              paddingVertical: spacing.md,
              marginBottom: spacing.lg,
              fontSize: 17,
            }}
          />
          <Button label="make our code" haptic="medium" disabled={busy} onPress={() => void onCreate()} />
        </Card>
      )}

      <Card>
        <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.sm }}>
          or she already has a code — type it in
        </Text>
        <TextInput
          placeholder="ABC123"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          value={theirCode}
          onChangeText={setTheirCode}
          style={{
            color: colors.ink,
            fontSize: 24,
            letterSpacing: 6,
            textAlign: 'center',
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            marginBottom: spacing.lg,
          }}
        />
        {error ? (
          <Text variant="small" color={colors.rose} style={{ marginBottom: spacing.md }}>
            {error}
          </Text>
        ) : null}
        <Button
          label="join her"
          tone="gold"
          haptic="heavy"
          disabled={busy || theirCode.length !== 6}
          onPress={() => void onJoin()}
        />
      </Card>
    </View>
  );
}
