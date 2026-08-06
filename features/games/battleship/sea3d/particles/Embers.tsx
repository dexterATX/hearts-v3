// features/games/battleship/sea3d/particles/Embers.tsx — warm blue-white
// motes lifting off the lower half of a close-up (the heart's embers on a
// hit).
//
// ONE driver shared value runs a 3.6s rise loop; every mote derives its own
// progress as `(driver + phase) % 1`, so the driver wrap lands exactly where
// it started for every mote — the loop wraps invisibly for all of them at
// once. Rise and fade are interpolations of that progress, the lateral sway
// is a sine over it (Math + interpolate only, all UI-thread). Motion lives on
// Animated.View transform arrays — never `transform` in animated svg props
// (the production-crash rule). A mote's halo is a plain child view, so the
// parent's animated opacity fades both together. Reduced motion renders a
// static scatter of faint dots; the loop cancels on unmount. One shared
// value, one loop — inside the close-up LOD budget.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { colors } from '../../../../../theme/theme';

// one rise cycle; each mote rides it on its own phase (3–4s per spec)
const CYCLE_MS = 3600;

// ember warmth has no theme token — danger/success are semantic-only, so the
// warm half of the motes carries its own amber alongside the blue-white ink
const WARM_CORE = '#EFC489';
const WARM_HALO = 'rgba(239,196,137,0.16)';
const COOL_HALO = 'rgba(232,238,249,0.14)';

// deterministic jitter, stable per index — render-side only, never in worklets
function rnd(i: number, salt: number) {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

type Mote = {
  phase: number; // offset into the shared cycle, 0..1
  x: number; // resting horizontal position
  y0: number; // launch height, lower half
  rise: number; // travel distance upward
  sway: number; // lateral amplitude
  swaySeed: number; // sine phase offset
  sways: number; // full sways per rise, 1..2
  peak: number; // max opacity
  core: number; // bright dot diameter
  warm: boolean;
};

function motes(size: number, count: number): Mote[] {
  return Array.from({ length: count }, (_, i) => ({
    phase: (i / count + rnd(i, 1) * 0.2) % 1,
    x: size * 0.12 + rnd(i, 2) * size * 0.76,
    y0: size * 0.58 + rnd(i, 3) * size * 0.3,
    rise: size * 0.34 + rnd(i, 4) * size * 0.22,
    sway: size * 0.03 + rnd(i, 5) * size * 0.03,
    swaySeed: rnd(i, 6) * Math.PI * 2,
    sways: 1 + rnd(i, 7),
    peak: 0.35 + rnd(i, 8) * 0.25,
    core: Math.max(1.4, size * 0.018 + rnd(i, 9) * size * 0.014),
    warm: rnd(i, 10) > 0.45,
  }));
}

function Ember({ mote, driver }: { mote: Mote; driver: SharedValue<number> }) {
  const halo = mote.core * 2.6;
  const style = useAnimatedStyle(() => {
    const p = (driver.value + mote.phase) % 1;
    return {
      opacity: interpolate(p, [0, 0.16, 0.7, 1], [0, mote.peak, mote.peak, 0]),
      transform: [
        { translateX: mote.x + mote.sway * Math.sin(p * Math.PI * 2 * mote.sways + mote.swaySeed) },
        { translateY: interpolate(p, [0, 1], [mote.y0, mote.y0 - mote.rise]) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.mote, { width: halo, height: halo }, style]}>
      <View
        style={[styles.halo, { borderRadius: halo / 2, backgroundColor: mote.warm ? WARM_HALO : COOL_HALO }]}
      />
      <View
        style={{
          width: mote.core,
          height: mote.core,
          borderRadius: mote.core / 2,
          backgroundColor: mote.warm ? WARM_CORE : colors.ink,
        }}
      />
    </Animated.View>
  );
}

export function Embers({ size, count = 7 }: { size: number; count?: number }) {
  const reduced = useReducedMotion();
  const driver = useSharedValue(0);
  const dots = motes(size, count);

  useEffect(() => {
    if (reduced) return;
    // in-out easing is invisible here: progress is per-mote derived, so the
    // wrap is continuous for every mote regardless of the driver's curve
    driver.value = withRepeat(
      withTiming(1, { duration: CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(driver);
  }, [reduced, driver]);

  if (reduced) {
    // static faint dots scattered through the lower half
    return (
      <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
      pointerEvents="none"
    >
        {dots.map((m, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: m.x,
              top: m.y0 - m.rise * 0.4,
              width: m.core,
              height: m.core,
              borderRadius: m.core / 2,
              backgroundColor: m.warm ? WARM_CORE : colors.ink,
              opacity: 0.2,
            }}
          />
        ))}
      </View>
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
      pointerEvents="none"
    >
      {dots.map((m, i) => (
        <Ember key={i} mote={m} driver={driver} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  mote: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
});
