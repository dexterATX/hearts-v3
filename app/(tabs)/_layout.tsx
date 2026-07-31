// app/(tabs)/_layout.tsx — the five tabs, with live badges from the slices.
import { Tabs } from 'expo-router';
import { Text } from '../../ui';
import { colors } from '../../theme/theme';
import { useBadges } from '../../features/home';

function TabIcon({ glyph, badge }: { glyph: string; badge: number }) {
  return (
    <Text variant="body" style={{ fontSize: 20 }}>
      {glyph}
      {badge > 0 ? ' •' : ''}
    </Text>
  );
}

export default function TabsLayout() {
  const badges = useBadges();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
        tabBarActiveTintColor: colors.rose,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'home',
          tabBarIcon: () => <TabIcon glyph="🏠" badge={0} />,
        }}
      />
      <Tabs.Screen
        name="letters"
        options={{
          title: 'letters',
          tabBarIcon: () => <TabIcon glyph="💌" badge={badges.letters} />,
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: 'play',
          tabBarIcon: () => <TabIcon glyph="🎮" badge={0} />,
        }}
      />
      <Tabs.Screen
        name="us"
        options={{
          title: 'us',
          tabBarIcon: () => <TabIcon glyph="♥️" badge={badges.voice} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'settings',
          tabBarIcon: () => <TabIcon glyph="⚙️" badge={0} />,
        }}
      />
    </Tabs>
  );
}
