// features/home/ui/StoryRow.tsx — one story line as a small artifact.
//
// Rows stopped being icon+text: a photo line carries the actual thumbnail, a
// voice line carries its waveform (blue and breathing while unheard), a
// letter line carries a wax seal (whole, or broken-open and dimmed), and a
// mood run is a fanned hand of bunnies, tilted like cards. Every artifact
// deals in with its row, tappable rows lift off the page under the finger
// (scale + rise + halo + leaning chevron), and a live arrival still gets the
// deck's pop-and-flare plus a sonar ring off the artifact.
//
// FlashList recycles rows, so NOTHING here keys off mount: the parent's
// seenRef id-set decides. The first deal of an id animates and records it; a
// recycled row whose id was seen pins every shared value to rest and renders
// 100% statically. Because shared values survive the prop swap, they are
// staged for the CURRENT line id during render (guarded by stagedFor) — the
// seen-check alone cannot fix a stale offset left by the previous item. The
// only repeating loop is the unheard-voice breath, cancelled on unmount.
// Reduced motion turns every animation off; content is identical.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Icon, MoodBunny, Text } from '../../../ui';
import { colors, motion, radius, spacing } from '../../../theme/theme';
import { feedLine, timeAgo, waveBars, type StoryLine } from '../model';

// local spring characters, copied from the mood deck (theme tokens stay untouched)
const ROW_SPRING = { damping: 16, stiffness: 210, mass: 0.9 }; // quick, small overshoot
const POP_SPRING = { damping: 14, stiffness: 260, mass: 0.8 }; // the rise-to-the-top bounce

/** Bunnies past this cap in one mood run collapse into a faint ` +n`. */
const MOOD_FAN_CAP = 5;
/** Waveform bars per voice row. */
const WAVE_BARS = 18;

// entrance geometry: the rise a dealt row settles from; the crouch an arrived
// row pops out of
const RISE_DY = 14;
const RISE_SCALE = 0.98;
const ARRIVE_SCALE = 0.94;
// the artifact lands just after its row's entrance starts settling
const ARTIFACT_LAG = 140;
const ARTIFACT_STAGGER = 36;
// the press halo's resting peak — a whisper of blue behind the row
const HALO_PEAK = 0.35;
// the artifact slot every row gets: the day card's spine runs down its center
export const ARTIFACT_SLOT = 40;

// gradient ids resolve per document; every instance mints its own
let uid = 0;

/** feedLine returns the whole sentence; the row already renders `who` as its
 *  own emphasized prefix, so strip the subject off the front — the same
 *  name-then-rest split PresenceChip composes by hand. */
function feedRest(line: StoryLine, partnerName: string, myId: string | null, who: string): string {
  const full = feedLine(line, partnerName, myId ?? '');
  return full.startsWith(who) ? full.slice(who.length) : ` ${full}`;
}

/** One deal-pop for an artifact: scale 0 → 1 on POP_SPRING after `delay`.
 *  Seen/reduced rows render the child bare — no animated wrapper at all. */
function DealPop({
  animate,
  delay,
  children,
}: {
  animate: boolean;
  delay: number;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(animate && !reduced ? 0 : 1);

  useEffect(() => {
    if (!animate || reduced) return;
    pop.value = withDelay(delay, withSpring(1, POP_SPRING));
  }, [animate, delay, reduced, pop]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  if (!animate || reduced) return <>{children}</>;
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The photo artifact: the actual thumbnail, rimmed in a hairline. Until the
 *  signed URL lands (or if signing failed) it falls back to the image icon on
 *  a tile — the row never waits on network to exist. */
function PhotoThumb({ url }: { url?: string }) {
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.sm,
        overflow: 'hidden',
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.lineBright,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: 34, height: 34, borderRadius: radius.sm - 2 }}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
        />
      ) : (
        <Icon name="image" size={16} color={colors.muted} />
      )}
    </View>
  );
}

/** The voice artifact: the note's pseudo-waveform (seeded by line id, the
 *  same bars the voice list draws). Blue while a partner's note is unheard —
 *  the breath loop rides on it — silver once heard or mine. Bars stagger up
 *  on the deal, scaleY from their bases. */
function VoiceWaveform({
  id,
  fresh,
  animate,
  baseDelay,
}: {
  id: string;
  fresh: boolean;
  animate: boolean;
  baseDelay: number;
}) {
  const bars = waveBars(id, WAVE_BARS);
  const color = fresh ? colors.blue : colors.faint;
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.sm,
        backgroundColor: fresh ? colors.blueTint : colors.surfaceAlt,
        borderWidth: 1,
        borderColor: fresh ? colors.blue : colors.line,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
      }}
    >
      {bars.map((b, i) =>
        animate ? (
          <WaveBar key={`${id}-${i}`} h={b} color={color} delay={baseDelay + i * ARTIFACT_STAGGER} />
        ) : (
          <View
            key={`${id}-${i}`}
            style={{ width: 2, height: Math.round(b * 22), borderRadius: 1, backgroundColor: color }}
          />
        ),
      )}
    </View>
  );
}

function WaveBar({ h, color, delay }: { h: number; color: string; delay: number }) {
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    grow.value = withDelay(delay, withSpring(1, POP_SPRING));
  }, [delay, reduced, grow]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));

  return (
    <Animated.View
      style={[
        { width: 2, height: Math.round(h * 22), borderRadius: 1, backgroundColor: color },
        style,
      ]}
    />
  );
}

/** The letter artifact: a wax seal. Blue-tint wax with a metal rim and a tiny
 *  letter glyph; once opened, the rim goes quiet and the seal dims — broken,
 *  kept, rereadable. */
function WaxSeal({ opened }: { opened: boolean }) {
  // gradient ids resolve per document; every seal mints its own
  const [sealId] = useState(() => `seal${uid++}`);
  return (
    <View
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: opened ? 0.55 : 1,
      }}
    >
      <Svg width={32} height={32}>
        <Defs>
          <RadialGradient id={sealId} cx="0.42" cy="0.38" r="0.62">
            <Stop offset="0" stopColor={colors.raised} />
            <Stop offset="0.7" stopColor={colors.blueTint} />
            <Stop offset="1" stopColor={colors.surface} />
          </RadialGradient>
        </Defs>
        <Circle cx={16} cy={16} r={14} fill={`url(#${sealId})`} />
        <Circle
          cx={16}
          cy={16}
          r={14}
          fill="none"
          stroke={opened ? colors.faint : colors.blue}
          strokeWidth={1.25}
        />
        <Circle
          cx={16}
          cy={16}
          r={10.5}
          fill="none"
          stroke={opened ? colors.faint : colors.lineBright}
          strokeWidth={0.75}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill as object} pointerEvents="none">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="letter" size={12} color={opened ? colors.faint : colors.silver} />
        </View>
      </View>
    </View>
  );
}

/** The mood artifact: a fanned hand of bunnies — overlapping, tilted like
 *  cards, the latest one a size up on a soft glow. Fan-in on the deal: each
 *  card rotates and scales in from the deck side, staggered. */
function MoodFan({
  steps,
  trailKey,
  animate,
  baseDelay,
}: {
  steps: string[];
  trailKey: string;
  animate: boolean;
  baseDelay: number;
}) {
  const shown = steps.slice(0, MOOD_FAN_CAP);
  const extra = steps.length - shown.length;
  const latest = shown.length - 1;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((s, i) => {
        const isLatest = i === latest;
        const tilt = (i % 2 === 0 ? -1 : 1) * 4;
        return (
          <View
            key={`${trailKey}-${s}-${i}`}
            style={{
              marginLeft: i === 0 ? 0 : -9,
              zIndex: i,
              transform: [{ rotate: `${tilt}deg` }],
            }}
          >
            <DealPop animate={animate} delay={baseDelay + i * ARTIFACT_STAGGER}>
              {isLatest ? (
                <View
                  style={{
                    borderRadius: radius.pill,
                    backgroundColor: colors.blueSoft,
                    padding: 2,
                  }}
                >
                  <MoodBunny mood={s} size={24} />
                </View>
              ) : (
                <MoodBunny mood={s} size={20} />
              )}
            </DealPop>
          </View>
        );
      })}
      {extra > 0 ? (
        <Text variant="small" color={colors.faint} style={{ marginLeft: spacing.xs }}>{` +${extra}`}</Text>
      ) : null}
    </View>
  );
}

export function StoryRow({
  line,
  partnerName,
  myId,
  onPressRow,
  entranceDelay,
  isNew,
  seenRef,
  thumbUrl,
}: {
  line: StoryLine;
  partnerName: string;
  myId: string | null;
  onPressRow?: (line: StoryLine) => void;
  entranceDelay: number;
  isNew: boolean;
  seenRef: { current: Set<string> };
  thumbUrl?: string;
}) {
  const reduced = useReducedMotion();
  const who = line.authorId === myId ? 'you' : partnerName;
  // The list's single accent: a voice note from them, unheard — new, for you,
  // playable now. Blue waveform tile; every other row stays steel.
  const fresh = line.kind === 'voice' && line.authorId !== myId && !line.heard;
  // mood trails are ambient — nothing to open; gifts deep-link somewhere real
  const tappable = line.kind !== 'moods' && !!onPressRow;

  // entrance / arrival
  const o = useSharedValue(1);
  const y = useSharedValue(0);
  const s = useSharedValue(1);
  const flare = useSharedValue(0);
  const sonar = useSharedValue(0);
  // press physics (tappable rows)
  const press = useSharedValue(1);
  const lift = useSharedValue(0);
  const glow = useSharedValue(0);
  const chevX = useSharedValue(0);
  // the unheard-voice breath — the row's only repeating loop
  const breathe = useSharedValue(1);

  // Stage the entrance for THIS line id. `entrance` persists per line id, so
  // re-renders of the same row never re-stage (and never restart) anything.
  const stagedFor = useRef<string | null>(null);
  const entrance = useRef<'static' | 'rise' | 'arrive'>('static');
  if (stagedFor.current !== line.id) {
    stagedFor.current = line.id;
    const seen = seenRef.current.has(line.id);
    if (!seen) seenRef.current.add(line.id); // dealt once, never again
    if (seen || reduced) {
      entrance.current = 'static';
      o.value = 1;
      y.value = 0;
      s.value = 1;
      flare.value = 0;
      sonar.value = 0;
    } else if (isNew) {
      entrance.current = 'arrive';
      o.value = 1; // the flare carries the reveal, not a fade
      y.value = 0;
      s.value = ARRIVE_SCALE;
      flare.value = 0;
      sonar.value = 0;
    } else {
      entrance.current = 'rise';
      o.value = 0;
      y.value = RISE_DY;
      s.value = RISE_SCALE;
    }
  }

  // `playedFor` makes the effect idempotent: a re-fire (delay prop shift,
  // StrictMode's double invoke) can never replay a dealt row's entrance.
  const playedFor = useRef<string | null>(null);
  useEffect(() => {
    const mode = entrance.current;
    if (mode === 'static' || playedFor.current === line.id) return;
    playedFor.current = line.id;
    if (mode === 'arrive') {
      // live arrival: the deck's mini pop-and-flare — one haptic at start, an
      // overshoot scale home, a single blue glow that crests ~0.5 and settles,
      // and a sonar ring off the artifact (springs, not timings — movement
      // stays springy)
      scheduleOnRN(Haptics.selectionAsync);
      s.value = withSpring(1, POP_SPRING);
      flare.value = withSequence(
        withSpring(1, POP_SPRING),
        withDelay(140, withSpring(0, motion.springSoft)),
      );
      sonar.value = withTiming(1, { duration: 620 });
    } else {
      o.value = withDelay(entranceDelay, withSpring(1, ROW_SPRING));
      y.value = withDelay(entranceDelay, withSpring(0, ROW_SPRING));
      s.value = withDelay(entranceDelay, withSpring(1, ROW_SPRING));
    }
  }, [line.id, entranceDelay, reduced, o, y, s, flare, sonar]);

  // the breath: 1 ↔ 0.55 on a slow reverse, ONLY while an unheard note from
  // them sits here — cancelled on unmount or the moment it is heard
  useEffect(() => {
    if (fresh && !reduced) {
      breathe.value = withRepeat(withTiming(0.55, { duration: 2400 }), -1, true);
    } else {
      breathe.value = 1; // a raw assignment also cancels any running loop
    }
    return () => cancelAnimation(breathe);
  }, [fresh, reduced, breathe]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }, { scale: s.value }],
  }));
  const flareStyle = useAnimatedStyle(() => ({ opacity: flare.value * 0.5 }));
  const sonarStyle = useAnimatedStyle(() => ({
    opacity: sonar.value === 0 ? 0 : 0.55 * (1 - sonar.value),
    transform: [{ scale: 0.6 + sonar.value * 0.9 }],
  }));
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }, { translateY: lift.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * HALO_PEAK }));
  const chevStyle = useAnimatedStyle(() => ({ transform: [{ translateX: chevX.value }] }));
  const breatheStyle = useAnimatedStyle(() => ({ opacity: breathe.value }));

  const handlePressIn = () => {
    if (reduced) return; // reduced motion: the tap works, nothing moves
    scheduleOnRN(Haptics.selectionAsync);
    press.value = withSpring(motion.pressScale, motion.spring);
    lift.value = withSpring(-1.5, motion.spring);
    glow.value = withSpring(1, motion.spring);
    chevX.value = withSpring(2, motion.spring);
  };
  const handlePressOut = () => {
    if (reduced) return;
    press.value = withSpring(1, motion.spring);
    lift.value = withSpring(0, motion.spring);
    glow.value = withSpring(0, motion.spring);
    chevX.value = withSpring(0, motion.spring);
  };

  // the artifact rides the same deal: only a row that is animating in pops
  // its artifact; a seen row renders it statically
  const dealt = entrance.current !== 'static' && !reduced;
  const artifactDelay = (entrance.current === 'rise' ? entranceDelay : 0) + ARTIFACT_LAG;

  const artifact =
    line.kind === 'photo' ? (
      <DealPop animate={dealt} delay={artifactDelay}>
        <PhotoThumb url={thumbUrl} />
      </DealPop>
    ) : line.kind === 'voice' ? (
      <Animated.View style={breatheStyle}>
        <VoiceWaveform id={line.id} fresh={fresh} animate={dealt} baseDelay={artifactDelay} />
      </Animated.View>
    ) : line.kind === 'letter' ? (
      <DealPop animate={dealt} delay={artifactDelay}>
        <WaxSeal opened={line.kind === 'letter' && line.opened} />
      </DealPop>
    ) : (
      // moods: a small node tile so the spine has a bead to run through
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.line,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="sparkle" size={16} color={colors.muted} />
      </View>
    );

  const row = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View style={{ width: ARTIFACT_SLOT, alignItems: 'center' }}>
        {artifact}
        {isNew ? (
          // the arrival sonar: one blue ring off the artifact, once
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                width: 36,
                height: 36,
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderColor: colors.blue,
              },
              sonarStyle,
            ]}
          />
        ) : null}
      </View>
      {line.kind === 'moods' ? (
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            overflow: 'hidden',
          }}
        >
          <Text variant="small" color={colors.muted} numberOfLines={1}>
            <Text variant="small" weight="medium" color={colors.ink}>
              {who}
            </Text>
            {' felt'}
          </Text>
          <MoodFan
            steps={line.steps}
            trailKey={line.id}
            animate={dealt}
            baseDelay={artifactDelay}
          />
        </View>
      ) : (
        <Text
          variant="small"
          color={colors.muted}
          numberOfLines={1}
          style={[
            { flex: 1 },
            // voice rows: extra air between the waveform tile and the text
            line.kind === 'voice' ? { marginLeft: spacing.sm } : null,
          ]}
        >
          <Text variant="small" weight="medium" color={colors.ink}>
            {who}
          </Text>
          {feedRest(line, partnerName, myId, who)}
        </Text>
      )}
      <Text variant="caption" color={colors.faint}>
        {timeAgo(line.at)}
      </Text>
      {fresh ? (
        <Animated.View style={chevStyle}>
          <Icon name="chevronRight" size={16} color={colors.blue} />
        </Animated.View>
      ) : tappable ? (
        <Animated.View style={chevStyle}>
          <Icon name="chevronRight" size={16} color={colors.faint} />
        </Animated.View>
      ) : null}
    </View>
  );

  // the live-arrival flare: a blueSoft wash behind the row, one crest, gone
  const flareLayer = (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: colors.blueSoft, borderRadius: radius.sm },
        flareStyle,
      ]}
    />
  );

  if (!tappable) {
    return (
      <Animated.View style={entranceStyle}>
        {flareLayer}
        {row}
      </Animated.View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPressRow(line)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{
        marginHorizontal: -spacing.sm,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.sm,
      }}
    >
      <Animated.View style={entranceStyle}>
        {/* the press halo: blue glow BEHIND the content — the row scales down
            and lifts off it, so a ring of blue reads around its edges */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.blueGlow, borderRadius: radius.sm },
            glowStyle,
          ]}
        />
        {flareLayer}
        <Animated.View style={pressStyle}>{row}</Animated.View>
      </Animated.View>
    </Pressable>
  );
}
