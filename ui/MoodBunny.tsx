// ui/MoodBunny.tsx — the mood vocabulary, drawn as bunnies.
//
// One component for every place a mood appears: chips, the mood card, the
// story feed's mood trails, the mini pill, journal tags, the letter lock
// picker. Keys match lib/moods.ts — unknown keys fall back to 💭, the same
// escape hatch moodMeta uses.
import { Image } from 'expo-image';
import type { ImageStyle } from 'expo-image';
import { Text as RNText } from 'react-native';

const BUNNIES: Record<string, number> = {
  loved: require('./bunnies/loved.png'),
  missing: require('./bunnies/missing.png'),
  happy: require('./bunnies/happy.png'),
  playful: require('./bunnies/playful.png'),
  sleepy: require('./bunnies/sleepy.png'),
  grumpy: require('./bunnies/grumpy.png'),
  stressed: require('./bunnies/stressed.png'),
};

export function MoodBunny({
  mood,
  size = 20,
  style,
}: {
  mood: string;
  size?: number;
  style?: ImageStyle;
}) {
  const source = BUNNIES[mood];
  if (!source) {
    return <RNText style={{ fontSize: size, lineHeight: size * 1.1 }}>💭</RNText>;
  }
  return (
    <Image
      source={source}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
      transition={120}
      accessibilityLabel={`mood ${mood}`}
    />
  );
}
