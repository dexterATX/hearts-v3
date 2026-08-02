// app/_layout.tsx — root: providers, auth bootstrap, reconcile, lock overlay.
// Routes own no logic (§2.2); this file only wires the layers together.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import * as SystemUI from 'expo-system-ui';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { colors, fonts } from '../theme/theme';
import { useSession } from '../lib/session/store';
import { setUuidRng } from '../lib/id';
import { startReconcile } from '../lib/sync/reconcile';
import { registerForPush, addPushResponseListener } from '../lib/notify/register';
import { useAuthBootstrap } from '../features/auth';
import { LockScreen } from '../features/settings';
import { router } from 'expo-router';

// Hermes has no global crypto — inject expo-crypto's CSPRNG for all uuids
setUuidRng((bytes) => Crypto.getRandomValues(bytes));

// paint the native window before React mounts, so a cold start never flashes
// white behind the JS bundle
void SystemUI.setBackgroundColorAsync(colors.bg);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      networkMode: 'offlineFirst', // the outbox owns writes; reads may hit cache offline
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

function Bootstrap() {
  useAuthBootstrap();
  const hydrated = useSession((s) => s.hydrated);
  const userId = useSession((s) => s.userId);
  const coupleId = useSession((s) => s.coupleId);
  const locked = useSession((s) => s.appLocked);
  // the persisted session (SecureStore) rehydrates asynchronously too — the
  // gates must wait for BOTH that and the supabase auth check, or a cold
  // start flashes sign-in for a signed-in pair (round-5 finding)
  const [persistReady, setPersistReady] = useState(useSession.persist.hasHydrated());
  useEffect(
    () => useSession.persist.onFinishHydration(() => setPersistReady(true)),
    [],
  );
  const ready = hydrated && persistReady;

  // reconcile + push, once we're authed
  useEffect(() => {
    if (!userId) return;
    const stop = startReconcile(queryClient);
    void registerForPush();
    const sub = addPushResponseListener((path) => {
      router.push(path as never);
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [userId]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.displaySemi, fontSize: 17 },
          // the default hairline reads as a seam against a near-black page
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="letters/[id]" options={{ title: 'a letter' }} />
        <Stack.Screen name="letters/new" options={{ title: 'seal a letter' }} />
        <Stack.Screen name="games/hangman" options={{ title: 'loves me, loves me not' }} />
        <Stack.Screen name="games/battleship" options={{ title: 'find my hearts' }} />
        <Stack.Screen name="games/quiz" options={{ title: 'how well do you know me' }} />
        <Stack.Screen name="games/cards" options={{ title: 'the deck' }} />
        <Stack.Screen name="canvas" options={{ title: 'draw together' }} />
        <Stack.Screen name="photos/[albumId]" options={{ title: 'album' }} />
      </Stack>
      {/* the lock sits above EVERY route — opaque, biometrics + PIN (§7.17) */}
      {ready && userId && locked ? <LockScreen /> : null}
      {/* unpaired users never see tabs */}
      {ready && !userId ? <RedirectGate to="/(auth)/sign-in" /> : null}
      {ready && userId && !coupleId ? <RedirectGate to="/(auth)/pair" /> : null}
    </View>
  );
}

function RedirectGate({ to }: { to: string }) {
  useEffect(() => {
    router.replace(to as never);
  }, [to]);
  return null;
}

export default function RootLayout() {
  // Gate on fonts OUTSIDE Bootstrap: an early return inside it would sit above
  // its other hooks and change hook order between renders. Holding the mount
  // also avoids a visible reflow from system font → Inter on first paint.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {fontsLoaded ? <Bootstrap /> : <View style={{ flex: 1, backgroundColor: colors.bg }} />}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
