// ui/MetallicFrame.tsx — a metal rim with a travelling shine.
//
// A gradient stroke alone gives you a BEVEL. Shine is light MOVING across that
// bevel, so this is built as a frame rather than an outline:
//
//   1. a brushed-metal gradient filling the whole frame
//   2. an optional lit layer (focus) faded in on the UI thread
//   3. a narrow white band that sweeps across, which is the shine itself
//   4. an opaque inner fill inset by `thickness`, so only the rim shows
//
// Everything but the inner fill is pointerEvents="none", so a TextInput living
// in `children` still receives the touch that focuses it. Nothing here toggles
// `elevation` — doing that around a focused TextInput makes Android reattach
// the native view and drop the keyboard.
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { colors } from '../theme/theme';

/** Brushed silver: highlight → silver → shadow → silver → highlight. */
export const SILVER_METAL = [
  { offset: '0%', color: '#FFFFFF', opacity: 0.95 },
  { offset: '16%', color: '#C6CFDD', opacity: 1 },
  { offset: '34%', color: '#6E7A8C', opacity: 1 },
  { offset: '50%', color: '#AEBACB', opacity: 1 },
  { offset: '66%', color: '#49525F', opacity: 1 },
  { offset: '84%', color: '#C6CFDD', opacity: 1 },
  { offset: '100%', color: '#F4F8FF', opacity: 0.95 },
] as const;

/** The same bevel, lit blue — focus keeps the metal reading as metal. */
export const BLUE_METAL = [
  { offset: '0%', color: '#E4EFFF', opacity: 1 },
  { offset: '20%', color: '#7FB0FF', opacity: 1 },
  { offset: '42%', color: '#2E6FE3', opacity: 1 },
  { offset: '58%', color: '#5E9BFF', opacity: 1 },
  { offset: '76%', color: '#1E4FA8', opacity: 1 },
  { offset: '100%', color: '#CFE2FF', opacity: 1 },
] as const;

/** Lit red — an errored field is still the same physical object. */
export const DANGER_METAL = [
  { offset: '0%', color: '#FFE1E5', opacity: 1 },
  { offset: '20%', color: '#FF9BA6', opacity: 1 },
  { offset: '42%', color: '#FF6B7D', opacity: 1 },
  { offset: '58%', color: '#FF8E9C', opacity: 1 },
  { offset: '76%', color: '#B03A48', opacity: 1 },
  { offset: '100%', color: '#FFD4DA', opacity: 1 },
] as const;

export type MetalStops = readonly { offset: string; color: string; opacity: number }[];

// gradient ids resolve per document; a shared literal collides once several
// frames are on screen at once, so every instance mints its own
let uid = 0;

function MetalRect({ id, stops, w, h, r }: { id: string; stops: MetalStops; w: number; h: number; r: number }) {
  return (
    <Svg width={w} height={h}>
      <Defs>
        {/* diagonal, so the highlight runs corner to corner like a real bevel */}
        <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          {stops.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} rx={r} ry={r} fill={`url(#${id})`} />
    </Svg>
  );
}

export function MetallicFrame({
  cornerRadius,
  thickness = 3.5,
  stops = SILVER_METAL,
  litStops,
  lit,
  fill = colors.surfaceAlt,
  shine = true,
  style,
  children,
}: {
  cornerRadius: number;
  thickness?: number;
  stops?: MetalStops;
  /** metal for the focused/active state */
  litStops?: MetalStops;
  /** 0→1, drives the lit layer. A shared value so focus never re-renders React. */
  lit?: SharedValue<number>;
  fill?: string;
  shine?: boolean;
  style?: ViewStyle;
  children?: ReactNode;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [ids] = useState(() => ({ base: `mtl${uid++}`, lit: `mtl${uid++}`, shine: `mtl${uid++}` }));
  const sweep = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !shine || box.w === 0) return;
    // reset to 0 inside the sequence: withRepeat replays from the CURRENT value,
    // so without this the second pass would animate 1→1 and never move again
    sweep.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(2600, withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) })),
      ),
      -1,
      false,
    );
  }, [reduced, shine, box.w, sweep]);

  const sheen = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-box.w, box.w]) }],
  }));
  const litStyle = useAnimatedStyle(() => ({ opacity: lit ? lit.value : 0 }));

  const ready = box.w > 0 && box.h > 0;

  return (
    <View
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
      }}
      style={[
        { borderRadius: cornerRadius, padding: thickness, overflow: 'hidden' },
        style,
      ]}
    >
      {ready ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <MetalRect id={ids.base} stops={stops} w={box.w} h={box.h} r={cornerRadius} />
        </View>
      ) : null}

      {ready && litStops ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, litStyle]}>
          <MetalRect id={ids.lit} stops={litStops} w={box.w} h={box.h} r={cornerRadius} />
        </Animated.View>
      ) : null}

      {ready && shine && !reduced ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sheen]}>
          <Svg width={box.w} height={box.h}>
            <Defs>
              {/* a narrow bright band — this is the shine */}
              <LinearGradient id={ids.shine} x1="0%" y1="0%" x2="100%" y2="30%">
                <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="38%" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="47%" stopColor="#FFFFFF" stopOpacity={0.55} />
                <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={0.95} />
                <Stop offset="53%" stopColor="#FFFFFF" stopOpacity={0.55} />
                <Stop offset="62%" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={box.w}
              height={box.h}
              rx={cornerRadius}
              ry={cornerRadius}
              fill={`url(#${ids.shine})`}
            />
          </Svg>
        </Animated.View>
      ) : null}

      {/* the fill covers everything but the rim */}
      <View
        style={{
          borderRadius: Math.max(0, cornerRadius - thickness),
          backgroundColor: fill,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}
