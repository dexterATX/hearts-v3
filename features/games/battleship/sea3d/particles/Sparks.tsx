// features/games/battleship/sea3d/particles/Sparks.tsx — a scatter of tiny
// bright sparks twinkling over a close-up scene.
//
// ONE motion driver for the whole field: a single wrapped 0 → 1 timing over
// 6s (LCM of the three spark periods — 1200/1500/2000ms — so every spark
// completes an INTEGER number of cycles per driver loop and the wrap frame
// is pixel-identical for all of them: invisible). Each dot derives its own
// opacity from the driver through a sine with its own cycle count and phase
// offset, so the twinkle (0 ↔ 0.9) breathes instead of blinking, and no two
// dots peak together. Positions come from a deterministic hash of the dot
// index — scattered, but stable across renders and remounts.
//
// Reduced motion holds every dot at a static mid-opacity; the driver loop
// cancels on unmount. Numeric svg props only — no transform anywhere.
import { useEffect, useMemo } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// a 1.5dp dot: diameter 1.5, radius 0.75 — bright ink reads as a spark
// against any of the close-up scenes without needing its own colour
const R = 0.75;
const PEAK = 0.9;
const REST_OPACITY = PEAK / 2; // reduced-motion frame: the twinkle's midpoint

// the three twinkle periods (ms); the driver runs their LCM, 6s, so each
// spark's cycle count below is always an integer and the loop wraps clean
const DRIVER_MS = 6000;
const PERIODS = [1200, 1500, 2000] as const;

// deterministic scatter: a stable hash of the dot index, no Math.random —
// the field must look identical on every render, remount, and device
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

type SparkSpec = { x: number; y: number; cycles: number; phase: number };

/** One dot: pure derivation from the shared driver — its opacity is the
 *  sine of its own integer cycle count plus a fixed phase offset. */
function SparkDot({ spec, driver }: { spec: SparkSpec; driver: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({
    opacity:
      REST_OPACITY +
      REST_OPACITY * Math.sin(2 * Math.PI * (spec.cycles * driver.value + spec.phase)),
  }));
  return <AnimatedCircle cx={spec.x} cy={spec.y} r={R} fill={colors.ink} animatedProps={props} />;
}

export function Sparks({ size, count = 8 }: { size: number; count?: number }) {
  const reduced = useReducedMotion();
  const driver = useSharedValue(0);

  // scatter once per (size, count): dots keep a margin of one radius from
  // the edge; period (hence integer cycle count) and phase rotate by index
  const specs = useMemo<SparkSpec[]>(() => {
    const span = Math.max(size - R * 4, 1);
    const out: SparkSpec[] = [];
    for (let i = 0; i < count; i++) {
      const period = PERIODS[i % PERIODS.length] as number;
      out.push({
        x: R * 2 + hash(i * 2) * span,
        y: R * 2 + hash(i * 2 + 1) * span,
        cycles: DRIVER_MS / period,
        phase: hash(i * 2 + 101),
      });
    }
    return out;
  }, [size, count]);

  useEffect(() => {
    if (reduced) return;
    driver.value = withRepeat(
      withTiming(1, { duration: DRIVER_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(driver);
    };
  }, [reduced, driver]);

  return (
    <Svg
      width={size}
      height={size}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {reduced
        ? specs.map((s, i) => (
            <Circle key={i} cx={s.x} cy={s.y} r={R} fill={colors.ink} opacity={REST_OPACITY} />
          ))
        : specs.map((s, i) => <SparkDot key={i} spec={s} driver={driver} />)}
    </Svg>
  );
}
