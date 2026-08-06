// features/games/battleship/sea3d/BoardCell.tsx — one square of the sea.
// A size×size Pressable that renders the far-view marker for its CellVisual
// and answers a tap with a light 0.94 spring dip + a selection haptic (only
// when interactive).
//
// Every face also wears the same tactile inset (CellFace, painted OVER the
// marker so unknown water gets it too): a 1px top-left inner highlight
// toward the arcade's one key light, a 1px bottom-right inner shadow away
// from it, and a soft radial pool of blue at the centre — the bevel that
// makes a flat square read as a dipped metal key. All static svg: no loops
// live here (the draft pulse is MarkerDraft's own business, LOD budget), so
// there is nothing to cancel, and reduced motion gets the very same faces.
import { useState, type ComponentType } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius } from '../../../../theme/theme';
import type { CellVisual, CellXY } from './seaTypes';
import { SEA_POP } from './seaMotion';
import { MarkerUnknown } from './markers/MarkerUnknown';
import { MarkerMiss } from './markers/MarkerMiss';
import { MarkerHit } from './markers/MarkerHit';
import { MarkerSunk } from './markers/MarkerSunk';
import { MarkerShip } from './markers/MarkerShip';
import { MarkerDraft } from './markers/MarkerDraft';

const MARKERS: Record<CellVisual, ComponentType<{ size: number }>> = {
  unknown: MarkerUnknown,
  miss: MarkerMiss,
  hit: MarkerHit,
  sunk: MarkerSunk,
  ship: MarkerShip,
  draft: MarkerDraft,
};

// house voice for screen readers: what this square IS, in one word-picture
const STATE_WORDS: Record<CellVisual, string> = {
  unknown: 'unknown water',
  miss: 'miss',
  hit: 'hit',
  sunk: 'sunk',
  ship: 'your heart',
  draft: 'placing',
};

// gradient ids resolve per document; every instance mints its own
let uid = 0;

/** The tactile inset every cell wears: inner bevel + centre light pool,
 *  one static svg paint. The highlight sits top-left — toward the arcade's
 *  one shared key light (KEY_LIGHT in features/games/ui/art/materials);
 *  the shadow falls bottom-right. Pure static svg, so reduced motion needs
 *  no branch and there is nothing to cancel. */
function CellFace({ size }: { size: number }) {
  const [poolId] = useState(() => `cellpool${uid++}`);
  const i = 0.5; // inset by half the hairline so the strokes never clip
  const r = radius.sm;
  const e = size - i; // the far inset edge
  // top edge + left edge, joined by the top-left corner arc
  const highlight = `M ${size - r} ${i} L ${r} ${i} A ${r} ${r} 0 0 0 ${i} ${r} L ${i} ${size - r}`;
  // bottom edge + right edge, joined by the bottom-right corner arc
  const shadow = `M ${r} ${e} L ${size - r} ${e} A ${r} ${r} 0 0 0 ${e} ${size - r} L ${e} ${r}`;
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={size} height={size}>
      <Defs>
        <RadialGradient id={poolId} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={colors.blue} stopOpacity={0.05} />
          <Stop offset="0.7" stopColor={colors.blue} stopOpacity={0.02} />
          <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* the soft pool of light the square's centre rests in */}
      <Rect x={0} y={0} width={size} height={size} rx={r} ry={r} fill={`url(#${poolId})`} />
      {/* the bevel: lit toward the key light, shaded away from it (the house
          "white" is ink; pure black is the shadow, same as MoodDeck's) */}
      <Path d={highlight} fill="none" stroke={colors.ink} strokeWidth={1} opacity={0.1} />
      <Path d={shadow} fill="none" stroke="#000000" strokeWidth={1} opacity={0.22} />
    </Svg>
  );
}

export function BoardCell({
  x,
  y,
  visual,
  size,
  interactive,
  onTap,
}: {
  x: number;
  y: number;
  visual: CellVisual;
  size: number;
  interactive: boolean;
  onTap: (c: CellXY) => void;
}) {
  const reduced = useReducedMotion();
  const press = useSharedValue(1);
  const Marker = MARKERS[visual];

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  return (
    <Pressable
      style={{ width: size, height: size }}
      disabled={!interactive}
      accessibilityRole="button"
      accessibilityLabel={`column ${x + 1} row ${y + 1}, ${STATE_WORDS[visual]}`}
      onPressIn={() => {
        if (!reduced) press.value = withSpring(0.94, SEA_POP);
      }}
      onPressOut={() => {
        if (!reduced) press.value = withSpring(1, SEA_POP);
      }}
      onPress={() => {
        void Haptics.selectionAsync();
        onTap({ x, y });
      }}
    >
      <Animated.View style={[{ width: size, height: size }, style]}>
        <Marker size={size} />
        {/* the tactile face dips with the press, so it rides the same view */}
        <CellFace size={size} />
      </Animated.View>
    </Pressable>
  );
}
