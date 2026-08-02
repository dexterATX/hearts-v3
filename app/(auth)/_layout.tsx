// app/(auth)/_layout.tsx — the auth group: no tabs, no chrome.
import { Stack } from 'expo-router';
import { colors } from '../../theme/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        // without this the stack's own background flashes light between
        // sign-in and pair, which on a near-black app reads as a bug
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
