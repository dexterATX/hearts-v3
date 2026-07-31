// features/auth/ui/SignInScreen.tsx — private to the auth slice.
import { useState } from 'react';
import { View, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, Button, Card } from '../../../ui';
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
    if (!res.ok) setError(res.error.message);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text variant="display" style={{ textAlign: 'center', marginBottom: spacing.sm }}>
        hearts
      </Text>
      <Text variant="body" color={colors.muted} style={{ textAlign: 'center', marginBottom: spacing.xxl }}>
        just us two. nobody else gets in.
      </Text>
      <Card>
        <TextInput
          placeholder="email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{
            color: colors.ink,
            borderBottomWidth: 1,
            borderColor: colors.line,
            paddingVertical: spacing.md,
            marginBottom: spacing.lg,
            fontSize: 17,
          }}
        />
        <TextInput
          placeholder="password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={{
            color: colors.ink,
            borderBottomWidth: 1,
            borderColor: colors.line,
            paddingVertical: spacing.md,
            marginBottom: spacing.xl,
            fontSize: 17,
          }}
        />
        {error ? (
          <Text variant="small" color={colors.rose} style={{ marginBottom: spacing.md }}>
            {error}
          </Text>
        ) : null}
        <Button
          label={busy ? 'one second…' : 'let me in'}
          haptic="medium"
          disabled={busy || !email || !password}
          onPress={() => void go()}
        />
      </Card>
    </KeyboardAvoidingView>
  );
}
