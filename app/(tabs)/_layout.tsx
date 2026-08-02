// app/(tabs)/_layout.tsx — the five tabs, with live badges from the slices.
import { View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { Icon, type IconName } from '../../ui';
import { colors, fonts, spacing } from '../../theme/theme';
import { useBadges } from '../../features/home';

/**
 * A dot, not a number. The pile is a promise, not a count (§6) — and a real
 * badge lets the icon carry the colour instead of an emoji doing it badly.
 */
function TabIcon({ name, color, badge }: { name: IconName; color: ColorValue; badge: number }) {
  return (
    <View>
      {/* the navigator types this as ColorValue; the values we hand it are our own hex tokens */}
      <Icon name={name} size={23} color={color as string} />
      {badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -3,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.blue,
            borderWidth: 3.5,
            borderColor: colors.surface,
          }}
        />
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const badges = useBadges();
  // Android is edge-to-edge, so the gesture pill / 3-button nav bar draws OVER
  // the app. React Navigation normally pads the tab bar for that itself, but
  // giving tabBarStyle an explicit `height` opts out of it — the bar then sits
  // under the system buttons. So the inset has to be added back by hand.
  const insets = useSafeAreaInsets();
  const BAR = 62;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.displaySemi, fontSize: 17 },
        headerShadowVisible: false,
        // without this the navigator paints its own default light background
        // behind every screen, which showed through as grey
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: 3,
          height: BAR + insets.bottom,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.sm,
          elevation: 0,
        },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.2 },
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'home',
          // the dashboard carries itself — a bare "home" title is wasted chrome
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} badge={0} />,
        }}
      />
      <Tabs.Screen
        name="letters"
        options={{
          title: 'letters',
          tabBarIcon: ({ color }) => <TabIcon name="letter" color={color} badge={badges.letters} />,
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: 'play',
          tabBarIcon: ({ color }) => <TabIcon name="play" color={color} badge={0} />,
        }}
      />
      <Tabs.Screen
        name="us"
        options={{
          title: 'us',
          tabBarIcon: ({ color }) => <TabIcon name="heart" color={color} badge={badges.voice} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'settings',
          tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} badge={0} />,
        }}
      />
    </Tabs>
  );
}
