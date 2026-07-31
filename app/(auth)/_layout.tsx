// app/(auth)/_layout.tsx — the auth group: no tabs, no chrome.
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
