// lib/notify/register.ts — push registration for Android 15/16 (research:
// channel MUST exist before the OS will show the permission prompt; push
// needs a dev build, not Expo Go).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../db/client';
import { colors } from '../../theme/theme';
import { ok, err, toAppError, type Result } from '../result';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const CHANNEL_ID = 'hearts';

export async function registerForPush(): Promise<Result<string>> {
  try {
    if (!Device.isDevice) return err({ code: 'validation', message: 'push needs a real phone' });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'hearts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.blue,
      });
    }

    const { status } = await Notifications.getPermissionsAsync();
    const final =
      status === 'granted' ? status : (await Notifications.requestPermissionsAsync()).status;
    if (final !== 'granted') {
      return err({ code: 'validation', message: 'notifications are off — turn them on to feel the pings' });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    const { data: user } = await supabase.auth.getUser();
    if (user.user) {
      await supabase
        .from('profiles')
        .update({ push_token: token.data })
        .eq('id', user.user.id);
    }
    return ok(token.data);
  } catch (e) {
    // _layout calls this with `void`, so the Result is dropped — without this
    // line a registration failure leaves no trace at all and the phone just
    // silently never gets pushes.
    console.warn(`[push] registration failed: ${(e as { message?: string })?.message ?? String(e)}`);
    return err(toAppError(e, 'could not set up notifications'));
  }
}

/** Deep links from the notify edge function land here (spec §2.7). */
export function addPushResponseListener(
  fn: (path: string) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((res) => {
    const data = res.notification.request.content.data as { path?: string };
    if (data?.path) fn(data.path);
  });
}
