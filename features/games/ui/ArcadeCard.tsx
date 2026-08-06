// features/games/ui/ArcadeCard.tsx — one game in the arcade, as a physical
// showcase card built around a STAGE: a 96dp-wide column running the card's
// full height on the left, its own fill, a soft radial blue glow behind the
// artifact, and a soft vertical seam (blueSoft, fading down) separating it
// from the copy. The game's living SVG scene (self-animated, from ./art) sits
// centered on it at 64dp. Beside it: title, blurb, and a chevron that becomes
// a spinner while the session starts; an error tucks a danger row under the
// copy.
//
// THE DEAL — the card enters on the soft spring, staggered by slot: fade,
// an 18dp rise, 2° of rotation settling to zero, 0.96 → 1 scale.
//
// THE TILT — the Pokémon-card trick: a horizontal pan (±10dp activate, so
// the page's vertical scroll always wins) reads the finger's position inside
// the card and leans it in 3D — perspective 900, rotateY ±7° from finger-x,
// rotateX ∓6° from finger-y — and a holographic light band (a diagonal
// silver gradient, 0 → 0.18 → 0) sweeps across the face following the tilt.
// Release springs everything flat.
//
// Tap is a separate gesture raced behind the pan (Exclusive, the deck's
// grammar): press-scale 0.97 + a selection haptic, onPress on release. A
// press also answers with light — the stage's glow flares to twice its peak
// and settles on release — and the chevron takes the home row's lean, 2dp
// toward the game and back.
// Reduced motion: no deal, no tilt, no band, no flare, no lean — a plain
// press.
import { useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { BLUE_METAL, Icon, MetallicFrame, SILVER_METAL, Text } from '../../../ui';
import { colors, motion, radius, spacing } from '../../../theme/theme';
import type { GameKind } from '../../../lib/db/database.types';
import { DaisyIcon, HeartsIcon, QuizIcon, DeckIcon, CanvasIcon } from './art/GameIcon';

// the iridescent glass icon set, one per tile
const ART: Record<GameKind | 'canvas', ComponentType<{ size?: number }>> = {
  hangman: DaisyIcon,
  battleship: HeartsIcon,
  quiz: QuizIcon,
  cards: DeckIcon,
  canvas: CanvasIcon,
};

// the deal: a soft landing on the soft spring, staggered by slot
const DEAL_LEAD_MS = 120;
const DEAL_STAGGER_MS = 80;
const DEAL_RISE = 18;
const DEAL_ROTATE = 2; // degrees
const DEAL_SCALE = 0.96;
// the tilt: the card leans toward the finger, never far
const TILT_Y = 7; // rotateY degrees at the card's edge
const TILT_X = 6; // rotateX degrees at top/bottom edge
const PERSPECTIVE = 900;
// the band: a silver strip sweeping the face as the card tilts
const BAND_W = 72;
const BAND_H = 320; // clipped by the card — it only needs to overhang
const BAND_TRAVEL = 0.7; // fraction of card width the band sweeps at full tilt
// the stage: a lit column the artifact performs on
const STAGE_W = 96;
const STAGE_MIN_H = 88;
const ART_SIZE = 64;
const GLOW_PEAK = 0.13; // ≈ blueSoft at the center, fading out
const GLOW_PEAK_ACCENT = 0.26; // accent cards get a hotter lamp

// gradient ids resolve per document; every card mints its own set
let uid = 0;

export function ArcadeCard({
  kind,
  title,
  blurb,
  index,
  accent = false,
  busy = false,
  error = null,
  onPress,
}: {
  kind: GameKind | 'canvas';
  title: string;
  blurb: string;
  index: number;
  accent?: boolean;
  busy?: boolean;
  error?: string | null;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return { band: `acb${n}`, glow: `acg${n}`, seam: `acs${n}`, flare: `acf${n}` };
  });
  const Art = ART[kind];

  // entrance progress: 0 dealt-from → 1 seated
  const enter = useSharedValue(reduced ? 1 : 0);
  // finger state: tilt angles, press scale, band sweep + visibility
  const rotX = useSharedValue(0);
  const rotY = useSharedValue(0);
  const press = useSharedValue(1);
  const bandX = useSharedValue(0);
  const bandO = useSharedValue(0);
  // the press answer: the stage glow's flare (0 rest → 1 twice the peak) and
  // the chevron's lean (the home row's 2dp toward the game)
  const flare = useSharedValue(0);
  const chevX = useSharedValue(0);
  // card box, for normalizing finger position (set from onLayout)
  const cardW = useSharedValue(1);
  const cardH = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      enter.value = 1;
      return;
    }
    enter.value = withDelay(DEAL_LEAD_MS + index * DEAL_STAGGER_MS, withSpring(1, motion.springSoft));
  }, [reduced, index, enter]);

  const pan = Gesture.Pan()
    .enabled(!reduced && !busy)
    .activeOffsetX([-10, 10]) // sideways only — vertical drags scroll the page
    .failOffsetY([-10, 10])
    .onStart((e) => {
      press.value = withSpring(motion.pressScale, motion.spring);
      flare.value = withSpring(1, motion.spring);
      chevX.value = withSpring(2, motion.spring);
      bandO.value = withTiming(1, { duration: motion.fadeMs });
      scheduleOnRN(Haptics.selectionAsync);
      if (cardW.value <= 1 || cardH.value <= 1) return;
      const nx = Math.max(-1, Math.min(1, (e.x / cardW.value) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, (e.y / cardH.value) * 2 - 1));
      rotY.value = nx * TILT_Y;
      rotX.value = -ny * TILT_X;
      bandX.value = nx * cardW.value * BAND_TRAVEL;
    })
    .onUpdate((e) => {
      if (cardW.value <= 1 || cardH.value <= 1) return;
      // the card leans toward the finger: right edge tips right, top tips up
      const nx = Math.max(-1, Math.min(1, (e.x / cardW.value) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, (e.y / cardH.value) * 2 - 1));
      rotY.value = nx * TILT_Y;
      rotX.value = -ny * TILT_X;
      bandX.value = nx * cardW.value * BAND_TRAVEL;
    })
    .onFinalize(() => {
      // released or stolen (scroll, background): settle flat, light fades
      press.value = withSpring(1, motion.spring);
      flare.value = withSpring(0, motion.spring);
      chevX.value = withSpring(0, motion.spring);
      rotX.value = withSpring(0, motion.spring);
      rotY.value = withSpring(0, motion.spring);
      bandO.value = withTiming(0, { duration: motion.fadeMs });
    });

  const tap = Gesture.Tap()
    .enabled(!busy)
    .onBegin(() => {
      // touch-down feedback even if the pan never activates
      if (!reduced) {
        press.value = withSpring(motion.pressScale, motion.spring);
        flare.value = withSpring(1, motion.spring);
        chevX.value = withSpring(2, motion.spring);
      }
      scheduleOnRN(Haptics.selectionAsync);
    })
    .onFinalize(() => {
      if (!reduced) {
        press.value = withSpring(1, motion.spring);
        flare.value = withSpring(0, motion.spring);
        chevX.value = withSpring(0, motion.spring);
      }
    })
    .onEnd(() => {
      scheduleOnRN(onPress);
    });

  const cardStyle = useAnimatedStyle(() => {
    const e = enter.value;
    return {
      opacity: e,
      transform: [
        { perspective: PERSPECTIVE },
        { translateY: (1 - e) * DEAL_RISE },
        { rotate: `${(1 - e) * DEAL_ROTATE}deg` },
        { rotateX: `${rotX.value}deg` },
        { rotateY: `${rotY.value}deg` },
        { scale: (DEAL_SCALE + (1 - DEAL_SCALE) * e) * press.value },
      ],
    };
  });

  const bandStyle = useAnimatedStyle(() => ({
    opacity: bandO.value,
    transform: [{ translateX: bandX.value }, { rotate: '18deg' }],
  }));

  // the flare: a second copy of the stage's glow fading in over the lit one —
  // at 1 the lamp reads twice its resting peak
  const glowFlareStyle = useAnimatedStyle(() => ({ opacity: flare.value }));
  const chevStyle = useAnimatedStyle(() => ({ transform: [{ translateX: chevX.value }] }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={title}
        onLayout={(e) => {
          cardW.value = e.nativeEvent.layout.width;
          cardH.value = e.nativeEvent.layout.height;
        }}
        style={[
          {
            borderRadius: radius.md,
          },
          cardStyle,
        ]}
      >
        {/* every card wears a real metal rim — silver for the shelf, blue
            metal for a session in play. Shine stays off: the tilt band is
            already the light show */}
        <MetallicFrame
          cornerRadius={radius.md}
          thickness={1.5}
          stops={accent ? BLUE_METAL : SILVER_METAL}
          fill={accent ? colors.blueTint : colors.surface}
          shine={false}
        >
          <View style={{ flexDirection: 'row' }}>
        {/* the holographic light band: a diagonal silver strip, transparent at
            both edges, sweeping with the tilt. Pure light — never touches the
            layout, reduced motion keeps it off */}
        {!reduced ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              {
                position: 'absolute',
                top: '50%',
                marginTop: -BAND_H / 2,
                left: '50%',
                marginLeft: -BAND_W / 2,
                width: BAND_W,
                height: BAND_H,
                zIndex: 1, // light washes over the stage too
              },
              bandStyle,
            ]}
          >
            <Svg width={BAND_W} height={BAND_H}>
              <Defs>
                <LinearGradient id={ids.band} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset={0} stopColor={colors.silver} stopOpacity={0} />
                  <Stop offset={0.5} stopColor={colors.silver} stopOpacity={0.18} />
                  <Stop offset={1} stopColor={colors.silver} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={BAND_W} height={BAND_H} fill={`url(#${ids.band})`} />
            </Svg>
          </Animated.View>
        ) : null}

        {/* the stage: full-height lit column with its own radial glow; the
            living scene performs at its center. A press flares the lamp: a
            second copy of the glow springs in over the lit one, doubling the
            peak, and settles on release */}
        <View
          style={{
            width: STAGE_W,
            minHeight: STAGE_MIN_H,
            alignSelf: 'stretch',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent ? colors.blueTint : colors.surfaceAlt,
          }}
        >
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={StyleSheet.absoluteFill}
          >
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id={ids.glow} cx="0.5" cy="0.5" r="0.62">
                  <Stop
                    offset="0"
                    stopColor={colors.blue}
                    stopOpacity={accent ? GLOW_PEAK_ACCENT : GLOW_PEAK}
                  />
                  <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${ids.glow})`} />
            </Svg>
          </View>
          {!reduced ? (
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[StyleSheet.absoluteFill, glowFlareStyle]}
            >
              <Svg width="100%" height="100%">
                <Defs>
                  <RadialGradient id={ids.flare} cx="0.5" cy="0.5" r="0.62">
                    <Stop
                      offset="0"
                      stopColor={colors.blue}
                      stopOpacity={accent ? GLOW_PEAK_ACCENT : GLOW_PEAK}
                    />
                    <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${ids.flare})`} />
              </Svg>
            </Animated.View>
          ) : null}
          <Art size={ART_SIZE} />
        </View>

        {/* the seam: no flat rim — a soft 1px vertical gradient, blueSoft
            dissolving downward, between the stage and the copy. ABSOLUTE on
            purpose: an in-flow 100%-height child makes the row's auto height
            circular and Yoga resolves it against the window — the giant-card
            bug. Off the layout path, it just paints. */}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: STAGE_W, top: 0, bottom: 0, width: 1 }}
        >
          <Svg width={1} height="100%">
            <Defs>
              <LinearGradient id={ids.seam} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.blue} stopOpacity={0.14} />
                <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={1} height="100%" fill={`url(#${ids.seam})`} />
          </Svg>
        </View>

        {/* the copy: title + blurb, chevron riding the right edge */}
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: spacing.lg,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text variant="heading">{title}</Text>
              <Text variant="small" color={colors.muted} style={{ marginTop: spacing.xs }}>
                {blurb}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator color={colors.blue} />
            ) : (
              // the home row's lean: 2dp toward the game on press-in, back on out
              <Animated.View style={chevStyle}>
                <Icon name="chevronRight" size={spacing.xl} color={colors.faint} />
              </Animated.View>
            )}
          </View>

          {error ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                marginTop: spacing.md,
              }}
            >
              <Icon name="alert" size={spacing.lg} color={colors.danger} />
              <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
                {error}
              </Text>
            </View>
          ) : null}
        </View>
          </View>
        </MetallicFrame>
      </Animated.View>
    </GestureDetector>
  );
}
