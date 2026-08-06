// features/auth/ui/PairScreen.tsx — 6-char invite code, both join orders (§7.1).
import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Text, Button, Card, Input, Icon } from '../../../ui';
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
      setError('codes are six letters and numbers. check each one');
      return;
    }
    const res = await join(normalizeInviteCode(theirCode));
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    // the joiner is done the moment the RPC succeeds — the partner profile
    // arrives on the next hydrate, so don't make her wait on it here
    router.replace('/(tabs)');
  };

  const onCopy = async () => {
    if (!myCode) return;
    await Clipboard.setStringAsync(myCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    // centred when it fits, scrollable when it does not — the code panel makes
    // this screen taller than a small phone on both paths at once
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.huge,
        gap: spacing.xl,
      }}
    >
      <Text variant="display" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
        become us
      </Text>

      {myCode ? (
        <Card style={{ alignItems: 'center', gap: spacing.lg }}>
          <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
            share this code. it is only ours
          </Text>
          {/* the code is the hero of this screen: silver on glass, in a panel
              of its own so it reads as a thing to be handed over */}
          <View
            style={{
              alignSelf: 'stretch',
              alignItems: 'center',
              backgroundColor: colors.silverSoft,
              borderRadius: radius.md,
              borderWidth: 3,
              borderColor: colors.lineBright,
              paddingVertical: spacing.lg,
              paddingHorizontal: spacing.md,
            }}
          >
            <Text
              variant="hero"
              color={colors.silver}
              numberOfLines={1}
              adjustsFontSizeToFit
              accessibilityLabel={`your invite code is ${myCode.split('').join(' ')}`}
              // tracking is added AFTER the last glyph too, so a centred run
              // sits half a space left of true centre — pull it back
              style={{ letterSpacing: spacing.sm, marginLeft: spacing.xs }}
            >
              {myCode}
            </Text>
          </View>
          <Button
            label={copied ? 'copied ♥' : 'copy it'}
            tone="secondary"
            icon={copied ? 'check' : undefined}
            onPress={() => void onCopy()}
            style={{ alignSelf: 'stretch' }}
          />
          <Text variant="caption" color={colors.muted} style={{ textAlign: 'center' }}>
            waiting for them to join… this screen updates itself
          </Text>
        </Card>
      ) : (
        <Card style={{ gap: spacing.lg }}>
          <Text variant="small" color={colors.muted}>
            start us. you will get a code to share
          </Text>
          <Input placeholder="what should they call you?" value={name} onChangeText={setName} />
          <Button
            label="make our code"
            size="lg"
            haptic="medium"
            disabled={busy}
            onPress={() => void onCreate()}
          />
        </Card>
      )}

      <Card style={{ gap: spacing.lg }}>
        <Text variant="small" color={colors.muted}>
          or you already have a code, type it in
        </Text>
        <Input
          code
          placeholder="ABC123"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          value={theirCode}
          onChangeText={setTheirCode}
        />
        {error ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Icon name="alert" size={spacing.lg} color={colors.danger} />
            <Text
              variant="small"
              color={colors.danger}
              accessibilityLiveRegion="polite"
              style={{ flex: 1 }}
            >
              {error}
            </Text>
          </View>
        ) : null}
        {/* `busy` is shared by both paths, so neither button claims the
            spinner — a create in flight must not make join look like it is
            working. Both dim, exactly as before. */}
        <Button
          label="join them"
          tone="secondary"
          haptic="heavy"
          disabled={busy || theirCode.length !== 6}
          onPress={() => void onJoin()}
        />
      </Card>
    </ScrollView>
  );
}
