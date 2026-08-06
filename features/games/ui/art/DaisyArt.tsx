// features/games/ui/art/DaisyArt.tsx — the hangman daisy as a living scene.
//
// Eight REAL petals — tapered bezier shapes, wide at the base and rounding to
// a soft tip, each with a faint vein curve and a base→tip gradient so light
// falls along its length — arranged radially with seeded length/angle jitter.
// The center is a disc-floret dome: a radial-gradient ball lit from the top
// left, speckled with twelve seed dots in a phyllotaxis spiral, plus a small
// specular catchlight. One key light rules the whole flower: petals pointing
// bottom-right wear a 12% dark wash, top-left petals a 6% lift.
//
// MOTION — the whole head breathes ±2.2° on an 8s reverse loop, and each
// petal trails it by 60ms per ring (longer, outer petals lag most) so the
// sway reads as overlapping action, not a rigid sticker. Every ~4s one petal
// PLUCKS: it first pulls 3° inward for 180ms (anticipation), then tumbles off
// under gravity — translateY accelerating on an in-quad curve with spin and
// fade — holds gone, and regrows from the center with an elastic-out
// overshoot; the landing exhales one soft blue ring off the dome. A soft
// elliptical contact shadow grounds the head and narrows as it leans.
// Deterministic seeded randomness only; a JS interval is the conductor and
// stamps a { index, seed } ticket each petal reacts to on the UI thread.
// Reduced motion: the fully-assembled, fully-lit daisy, static.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../../../../theme/theme';
import { seededRand, KEY_LIGHT } from './materials';

const PETALS = 8;
const SEEDS = 12; // disc-floret dots in the dome's phyllotaxis spiral
// the breeze: ±2.2° on a slow 8s reverse loop; petals trail 60ms per ring
const SWAY_DEG = 2.2;
const SWAY_MS = 8000;
const LAG_PER_RING_MS = 60;
// the pluck: anticipation → gravity tumble → hold gone → elastic regrow
const PLUCK_EVERY_MS = 4000;
const ANTICIPATE_MS = 180;
const ANTICIPATE_DEG = 3;
const TUMBLE_MS = 680;
const HOLD_GONE_MS = 600;
const REGROW_MS = 780;
const PULSE_MS = 750; // the landing ring exhaled off the dome
// the one key light lives at the top left of every scene (shared token,
// normalized here for the dot-product facing factor)
const LIGHT_LEN = Math.hypot(KEY_LIGHT.dx, KEY_LIGHT.dy);
const TO_LIGHT = { x: KEY_LIGHT.dx / LIGHT_LEN, y: KEY_LIGHT.dy / LIGHT_LEN };
const DARK_WASH = 0.12; // bottom-right petals sink into shade
const LIFT = 0.06; // top-left petals catch a little extra light
const GOLDEN_ANGLE = 2.39996; // radians — the phyllotaxis step

// gradient ids resolve per document; every instance mints its own
let uid = 0;

type PluckTicket = { i: number; seed: number };
type PetalSpec = {
  /** radians; the petal sits (and flies) along this ray from the center */
  angle: number;
  /** base→tip length in viewBox units, jittered */
  len: number;
  /** sway ring 0 inner … 2 outer: outer rings trail the head further. All
   *  petals in a ring share one sway driver (identical timing), so eight
   *  petal loops collapse to three with no visible difference */
  ring: number;
  /** dot(petalRay, toLight): >0 catches light, <0 falls into shade */
  facing: number;
};

// a tapered petal pointing straight up from the flower center: wide at the
// base, widest just past the middle, rounding to a soft tip
function petalPath(len: number): string {
  const w1 = 3.1; // half-width near the base third
  const w2 = 4.3; // half-width at the waist
  const tip = 1.5; // half-width where the tip cap begins
  return [
    'M 28 28',
    `C ${28 - w1} ${28 - len * 0.2}, ${28 - w2} ${28 - len * 0.58}, ${28 - tip} ${28 - len * 0.86}`,
    `Q 28 ${28 - len - 1.1}, ${28 + tip} ${28 - len * 0.86}`,
    `C ${28 + w2} ${28 - len * 0.58}, ${28 + w1} ${28 - len * 0.2}, 28 28`,
    'Z',
  ].join(' ');
}

// the vein: a faint silver thread bowing along the petal's spine
function veinPath(len: number): string {
  return `M 28 27 Q 29.1 ${28 - len * 0.5} 28 ${28 - len + 2.2}`;
}

function Petal({
  index,
  spec,
  size,
  pluck,
  pulse,
  sway,
}: {
  index: number;
  spec: PetalSpec;
  size: number;
  pluck: SharedValue<PluckTicket>;
  /** 0→1 one-shot, restarted here whenever this petal's regrow lands */
  pulse: SharedValue<number>;
  /** this ring's shared sway loop, driven by the parent (0.5 is upright) */
  sway: SharedValue<number>;
}) {
  const [ids] = useState(() => ({ petal: `dzp${uid++}` }));
  // mode: 0 attached · 1 anticipation · 2 tumbling · 3 gone · 4 regrowing
  const mode = useSharedValue(0);
  const t = useSharedValue(0); // progress inside the current mode
  const spin = useSharedValue(1); // tumble direction, re-stamped per pluck

  useAnimatedReaction(
    () => pluck.value,
    (cur, prev) => {
      if (cur.i !== index || cur === prev) return;
      const spinDir = cur.seed > 0.5 ? 1 : -1;
      // anticipation: a small pull against the take-off, slow-in/slow-out
      mode.value = 1;
      t.value = 0;
      t.value = withTiming(1, { duration: ANTICIPATE_MS, easing: Easing.inOut(Easing.quad) }, (a) => {
        if (!a) return;
        // the tumble: gravity takes over — fall accelerates, spin follows
        mode.value = 2;
        t.value = 0;
        t.value = withTiming(1, { duration: TUMBLE_MS, easing: Easing.in(Easing.quad) }, (f) => {
          if (!f) return;
          // hold gone, then regrow from the heart with an elastic overshoot
          mode.value = 3;
          t.value = withDelay(
            HOLD_GONE_MS,
            withTiming(1, { duration: 16 }, (h) => {
              if (!h) return;
              mode.value = 4;
              t.value = 0;
              t.value = withTiming(
                1,
                { duration: REGROW_MS, easing: Easing.out(Easing.elastic(1.1)) },
                (r) => {
                  if (!r) return;
                  mode.value = 0;
                  // the landing exhales one soft blue ring off the center
                  pulse.value = 0;
                  pulse.value = withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad) });
                },
              );
            }),
          );
        });
      });
      // spin direction is per-pluck; keep it reachable from the style
      spin.value = spinDir;
    },
    [index],
  );

  useEffect(
    () => () => {
      cancelAnimation(t);
      cancelAnimation(spin);
    },
    [t, spin],
  );

  // global frame: fade + gravity fall + anticipation pull + tumble spin
  const outerStyle = useAnimatedStyle(() => {
    const m = mode.value;
    const p = t.value;
    if (m === 1) {
      const pull = p * 1.2; // a small crouch toward the heart
      return {
        opacity: 1,
        transform: [
          { translateX: -Math.cos(spec.angle) * pull },
          { translateY: -Math.sin(spec.angle) * pull },
          { rotate: `${-spin.value * ANTICIPATE_DEG * p}deg` },
        ],
      };
    }
    if (m === 2) {
      const seed = pluck.value.seed;
      const drift = Math.cos(spec.angle) * 6 + (seed - 0.5) * 16;
      return {
        opacity: interpolate(p, [0, 0.5, 0.85], [1, 1, 0], Extrapolation.CLAMP),
        transform: [
          { translateX: drift * p },
          { translateY: size * 0.5 * p }, // in-quad easing makes this gravity
          { rotate: `${spin.value * (150 + seed * 140) * p}deg` },
        ],
      };
    }
    if (m === 3) return { opacity: 0, transform: [] };
    return { opacity: 1, transform: [] };
  });

  // ray frame (rotated to this petal's angle): sway lag + crouch + regrow
  const innerStyle = useAnimatedStyle(() => {
    const swayDeg = interpolate(sway.value, [0, 1], [-SWAY_DEG, SWAY_DEG]);
    const m = mode.value;
    let scale = 1;
    if (m === 1) scale = interpolate(t.value, [0, 1], [1, 0.94]); // anticipation crouch
    else if (m === 2) scale = interpolate(t.value, [0, 1], [0.94, 0.8]);
    else if (m === 3) scale = 0.001;
    else if (m === 4) scale = Math.max(t.value, 0.001); // elastic-out overshoot
    return { transform: [{ rotate: `${swayDeg}deg` }, { scale }] };
  });

  const baseDeg = (spec.angle * 180) / Math.PI + 90; // drawn pointing up
  const path = petalPath(spec.len);
  // the key light: lit petals get a silver lift, shaded ones a dark wash
  const lit = spec.facing > 0;
  const washOpacity = lit ? LIFT * spec.facing : DARK_WASH * -spec.facing;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, outerStyle]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${baseDeg}deg` }] }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, innerStyle]}>
          <Svg width={size} height={size} viewBox="0 0 56 56">
            <Defs>
              {/* light falls along the petal: bright at the base, gone at the tip */}
              <LinearGradient
                id={ids.petal}
                gradientUnits="userSpaceOnUse"
                x1={28}
                y1={28}
                x2={28}
                y2={28 - spec.len}
              >
                <Stop offset="0" stopColor={colors.silverSoft} stopOpacity={1} />
                <Stop offset="0.55" stopColor={colors.silverSoft} stopOpacity={0.6} />
                <Stop offset="1" stopColor={colors.silverSoft} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path
              d={path}
              fill={`url(#${ids.petal})`}
              stroke={colors.silver}
              strokeWidth={1}
              strokeOpacity={0.55}
            />
            <Path
              d={veinPath(spec.len)}
              fill="none"
              stroke={colors.silver}
              strokeWidth={0.7}
              strokeOpacity={0.35}
              strokeLinecap="round"
            />
            {/* the static key-light wash on this petal */}
            <Path d={path} fill={lit ? colors.silver : '#000'} opacity={washOpacity} />
          </Svg>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export function DaisyArt({ size = 56 }: { size?: number }) {
  const reduced = useReducedMotion();
  const [ids] = useState(() => ({
    halo: `dzh${uid++}`,
    ring: `dzr${uid++}`,
    dome: `dzd${uid++}`,
    shadow: `dzs${uid++}`,
  }));
  const pluck = useSharedValue<PluckTicket>({ i: -1, seed: 0 });
  const glow = useSharedValue(0.55);
  const sway = useSharedValue(reduced ? 0.5 : 0); // the head's own phase
  // one sway driver per ring (0 inner … 2 outer), each trailing the head by
  // ring × LAG_PER_RING_MS — every petal in a ring shares its driver, so the
  // eight petals run three loops instead of eight, with identical motion
  const swayR0 = useSharedValue(reduced ? 0.5 : 0);
  const swayR1 = useSharedValue(reduced ? 0.5 : 0);
  const swayR2 = useSharedValue(reduced ? 0.5 : 0);
  const pulse = useSharedValue(1); // starts finished — nothing shows until the first landing
  const next = useRef(0);

  // the petals: seeded once per mount — jittered rays and lengths, ring lag
  // from length (outer petals trail), and a static key-light facing factor
  const [petals] = useState<PetalSpec[]>(() => {
    const rand = seededRand('daisy-petals');
    const raw = Array.from({ length: PETALS }, (_, i) => ({
      angle: -Math.PI / 2 + (i * 2 * Math.PI) / PETALS + (rand() - 0.5) * 0.09,
      len: 15.5 + rand() * 2.4,
    }));
    let min = Infinity;
    let max = -Infinity;
    for (const p of raw) {
      if (p.len < min) min = p.len;
      if (p.len > max) max = p.len;
    }
    return raw.map((p) => {
      const ring = Math.round(((p.len - min) / (max - min || 1)) * 2); // 0 inner … 2 outer
      return {
        ...p,
        ring,
        facing: Math.cos(p.angle) * TO_LIGHT.x + Math.sin(p.angle) * TO_LIGHT.y,
      };
    });
  });

  // the dome's disc florets: a phyllotaxis spiral of deterministic seed dots
  const [seeds] = useState(() => {
    const rand = seededRand('daisy-dome');
    return Array.from({ length: SEEDS }, (_, i) => {
      const a = i * GOLDEN_ANGLE;
      const r = 2.05 * Math.sqrt(i + 0.4);
      return { x: 28 + Math.cos(a) * r, y: 28 + Math.sin(a) * r, o: 0.3 + rand() * 0.3 };
    });
  });

  // the conductor: every ~4s the next petal in rotation gets the pluck ticket
  useEffect(() => {
    if (reduced) return;
    const rand = seededRand('daisy-pluck');
    const iv = setInterval(() => {
      pluck.value = { i: next.current, seed: rand() };
      next.current = (next.current + 1) % PETALS;
    }, PLUCK_EVERY_MS);
    return () => clearInterval(iv);
  }, [reduced, pluck]);

  // the glow breathes; cancelled on unmount, static when reduced motion
  useEffect(() => {
    if (reduced) {
      glow.value = 1;
      return;
    }
    glow.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(glow);
  }, [reduced, glow]);

  // the breeze on the head; petals follow with their own lag. Upright and
  // still when reduced
  useEffect(() => {
    if (reduced) {
      sway.value = 0.5;
      return;
    }
    sway.value = withRepeat(
      withTiming(1, { duration: SWAY_MS / 2, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(sway);
  }, [reduced, sway]);

  // the rings' shared sway loops: the same reverse timing as the head's,
  // each ring starting LAG_PER_RING_MS after the previous — the follow-through
  useEffect(() => {
    const rings = [
      { s: swayR0, lag: 0 },
      { s: swayR1, lag: LAG_PER_RING_MS },
      { s: swayR2, lag: 2 * LAG_PER_RING_MS },
    ];
    if (reduced) {
      for (const r of rings) {
        cancelAnimation(r.s);
        r.s.value = 0.5; // upright
      }
      return;
    }
    for (const r of rings) {
      r.s.value = withDelay(
        r.lag,
        withRepeat(
          withTiming(1, { duration: SWAY_MS / 2, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        ),
      );
    }
    return () => {
      for (const r of rings) cancelAnimation(r.s);
    };
  }, [reduced, swayR0, swayR1, swayR2]);

  const swayStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(sway.value, [0, 1], [-SWAY_DEG, SWAY_DEG])}deg` }],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  // the outer ring answers the same breath, softer and a touch wider
  const outerGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0.55, 1], [0.25, 0.85], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(glow.value, [0.55, 1], [0.96, 1.05], Extrapolation.CLAMP) }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.5, 0]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.4, 1.25]) }],
  }));
  // the contact shadow grounds the head; it narrows and softens as it leans
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sway.value, [0, 0.5, 1], [0.85, 1, 0.85]),
    transform: [{ scaleX: interpolate(sway.value, [0, 0.5, 1], [0.94, 1, 0.94]) }],
  }));

  const RING = 30; // the landing pulse's resting diameter, in viewBox units

  return (
    <View style={{ width: size, height: size }}>
      {/* the contact shadow stays on the ground — it does not sway, it breathes */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shadowStyle]}>
        <Svg width={size} height={size} viewBox="0 0 56 56">
          <Defs>
            <RadialGradient id={ids.shadow} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#000" stopOpacity={0.38} />
              <Stop offset="0.7" stopColor="#000" stopOpacity={0.16} />
              <Stop offset="1" stopColor="#000" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={28} cy={47.5} rx={13} ry={2.6} fill={`url(#${ids.shadow})`} />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, swayStyle]}>
        {petals.map((spec, i) => (
          <Petal
            key={i}
            index={i}
            spec={spec}
            size={size}
            pluck={pluck}
            pulse={pulse}
            sway={spec.ring === 0 ? swayR0 : spec.ring === 1 ? swayR1 : swayR2}
          />
        ))}
        {/* one soft blue ring exhaled off the center when a petal lands */}
        {!reduced ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: ((28 - RING / 2) / 56) * size,
                top: ((28 - RING / 2) / 56) * size,
                width: (RING / 56) * size,
                height: (RING / 56) * size,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: colors.blue,
              },
              pulseStyle,
            ]}
          />
        ) : null}
        {/* the two-ring glow: a soft outer band, then the bright halo */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, outerGlowStyle]}>
          <Svg width={size} height={size} viewBox="0 0 56 56">
            <Defs>
              <RadialGradient id={ids.ring} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={colors.blue} stopOpacity={0} />
                <Stop offset="0.55" stopColor={colors.blue} stopOpacity={0.12} />
                <Stop offset="0.72" stopColor={colors.blue} stopOpacity={0.4} />
                <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={28} cy={28} r={11.5} fill={`url(#${ids.ring})`} />
          </Svg>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, haloStyle]}>
          <Svg width={size} height={size} viewBox="0 0 56 56">
            <Defs>
              <RadialGradient id={ids.halo} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={colors.blue} stopOpacity={1} />
                <Stop offset="0.55" stopColor={colors.blue} stopOpacity={0.8} />
                <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={28} cy={28} r={9} fill={`url(#${ids.halo})`} />
          </Svg>
        </Animated.View>
        {/* the disc-floret dome: raised steel lit from the top left, with a
            phyllotaxis of seed dots and a small specular catchlight */}
        <Svg width={size} height={size} viewBox="0 0 56 56">
          <Defs>
            <RadialGradient id={ids.dome} cx="0.38" cy="0.34" r="0.75">
              <Stop offset="0" stopColor={colors.raised} />
              <Stop offset="1" stopColor={colors.blueTint} />
            </RadialGradient>
          </Defs>
          <Circle
            cx={28}
            cy={28}
            r={7.5}
            fill={`url(#${ids.dome})`}
            stroke={colors.silver}
            strokeWidth={0.6}
            strokeOpacity={0.35}
          />
          {seeds.map((s, i) => (
            <Circle key={i} cx={s.x} cy={s.y} r={0.4} fill={colors.silver} opacity={s.o} />
          ))}
          <Circle cx={25.6} cy={25.4} r={1.1} fill={colors.silver} opacity={0.6} />
        </Svg>
      </Animated.View>
    </View>
  );
}
