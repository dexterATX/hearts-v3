// features/auth/ui/SignInScreen.tsx — private to the auth slice.
import { useState } from 'react';
import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Text, Button, Card, Input, Icon } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import { useSignIn } from '../hooks';

export function SignInScreen() {
  const { submit, busy } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setError(null);
    const res = await submit(email, password);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    // Nothing else moves a signed-in user off this screen: the root layout's
    // gates only push TOWARD sign-in/pair, never away from them. While the
    // account was unpaired the pair gate happened to navigate for us, so this
    // was invisible — once paired, both gates go quiet and the screen just sat
    // there flashing "one second…". If the couple has not loaded yet the pair
    // gate still redirects from here, which is the correct destination.
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.huge,
        }}
      >
        <View style={{ alignItems: 'center', marginBottom: spacing.huge }}>
          <Text variant="hero">hearts</Text>
          <Text
            variant="body"
            color={colors.muted}
            style={{ textAlign: 'center', marginTop: spacing.md }}
          >
            just us two. nobody else gets in.
          </Text>
        </View>

        <View style={{ gap: spacing.lg }}>
          <Input
            label="email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Input label="password" secureTextEntry value={password} onChangeText={setPassword} />

          {error ? (
            <Card
              variant="danger"
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <Icon name="alert" size={spacing.xl} color={colors.danger} />
              <Text
                variant="small"
                color={colors.danger}
                accessibilityLiveRegion="polite"
                style={{ flex: 1 }}
              >
                {error}
              </Text>
            </Card>
          ) : null}

          <Button
            label={busy ? 'one second…' : 'let me in'}
            size="lg"
            haptic="medium"
            loading={busy}
            disabled={busy || !email || !password}
            onPress={() => void go()}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
