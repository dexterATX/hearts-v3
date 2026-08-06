// features/games/battleship/sea3d/SeaCloseUp.tsx — the dive stage.
//
// When a cell is focused the camera springs down into it (zoom 1 → 5.5) and
// this overlay crossfades in as `camera.zoom` passes CLOSEUP_FADE_AT — the
// shared value is read straight in the wrapper's useAnimatedStyle, so the
// fade tracks the flight frame-for-frame with no React re-renders. The stage
// itself pops in 0.9 → 1 on SEA_POP. Reduced motion drops the zoom coupling:
// the stage simply appears.
//
// ONE close-up exists at a time (the parent nulls `cell` to close), and the
// scene inside is keyed on phase+visual so a verdict landing swaps radar for
// foam/embers with a clean remount — every loop in the old scene cancels.
//
// Controls: battle + untouched water gets FireControls (the only targetable
// face); placement's unknown/draft water gets the draft toggle wired to
// onToggleDraft; everything else gets a quiet way back. Backdrop tap and the
// close button both fly the camera home AND tell the parent.
//
// A11y: the scenes are pure light and hide from the reader, so the stage
// SPEAKS them — one announcement per dive and per verdict flip (sceneSpeech).
import { useEffect, type ComponentType } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Button, MetallicFrame, Text } from '../../../../ui';
import { colors, radius, spacing } from '../../../../theme/theme';
import type { BattlePhase, CellVisual, CellXY, SceneProps } from './seaTypes';
import { CLOSEUP_FADE_AT, SEA_POP, ZOOM_FAR } from './seaMotion';
import type { SeaCamera } from './useSeaCamera';
import { CloseDraft } from './scenes/CloseDraft';
import { CloseHit } from './scenes/CloseHit';
import { CloseMiss } from './scenes/CloseMiss';
import { CloseRadar } from './scenes/CloseRadar';
import { CloseShip } from './scenes/CloseShip';
import { CloseSunk } from './scenes/CloseSunk';
import { FireControls } from './hud/FireControls';

const FRAME = 2; // the metal rim's thickness, subtracted from the scene box
const COLS = 'ABCDEFGH'; // letter from x — 'C5' means x=2, y=4
const BACKDROP = 'rgba(5,7,12,0.62)'; // colors.bg, dimmed over the sea

/** The face of water decides the close-up scene: unexplored water scans
 *  (radar) in battle but is a draft candidate while placing hearts. */
function pickScene(visual: CellVisual, phase: BattlePhase): ComponentType<SceneProps> {
  switch (visual) {
    case 'unknown':
      return phase === 'placement' ? CloseDraft : CloseRadar;
    case 'draft':
      return CloseDraft;
    case 'miss':
      return CloseMiss;
    case 'hit':
      return CloseHit;
    case 'sunk':
      return CloseSunk;
    case 'ship':
      return CloseShip;
  }
}

/** What the screen reader hears when a scene opens (and when a verdict
 *  flips it): the same face-of-water mapping as pickScene, in words. The
 *  scenes themselves are hidden from the a11y tree — this line is them. */
function sceneSpeech(visual: CellVisual, phase: BattlePhase): string {
  switch (visual) {
    case 'unknown':
      return phase === 'placement'
        ? 'open water, waiting for a heart'
        : 'the radar sweeps untouched water';
    case 'draft':
      return 'a heart is taking shape here';
    case 'miss':
      return 'a miss. the foam is settling';
    case 'hit':
      return 'a hit. the heart glows';
    case 'sunk':
      return 'sunk. the wreck rests below';
    case 'ship':
      return 'your heart, safe at anchor';
  }
}

export function SeaCloseUp({
  cell,
  visual,
  phase,
  camera,
  onFire,
  onToggleDraft,
  onClose,
}: {
  cell: CellXY | null;
  visual: CellVisual | null;
  phase: BattlePhase;
  camera: SeaCamera;
  onFire: () => void;
  onToggleDraft: () => void;
  onClose: () => void;
}): React.JSX.Element | null {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  // ~78% of screen width, square; the height cap keeps landscape sane
  const stage = Math.round(Math.min(width * 0.78, height * 0.66));
  const inner = stage - FRAME * 2;

  const zoom = camera.zoom;
  // the crossfade: only the wrapper reads zoom, so the whole overlay rides
  // the camera spring without a single JS-frame re-render
  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: reduced
      ? 1
      : interpolate(zoom.value, [ZOOM_FAR, CLOSEUP_FADE_AT], [0, 1], Extrapolation.CLAMP),
  }));

  // entrance pop: scale 0.9 → 1 + fade on SEA_POP, replayed per cell dived
  const enter = useSharedValue(reduced ? 1 : 0);
  const cellX = cell?.x ?? -1;
  const cellY = cell?.y ?? -1;
  useEffect(() => {
    if (reduced) {
      enter.value = 1;
      return;
    }
    enter.value = 0;
    enter.value = withSpring(1, SEA_POP);
    return () => cancelAnimation(enter);
  }, [reduced, enter, cellX, cellY]);

  // the dive speaks: opening a square (or a verdict flipping its scene under
  // you) announces what the eye sees — the scenes themselves hide from the
  // a11y tree, so this one line is the whole close-up for a screen reader
  useEffect(() => {
    if (!cell || !visual) return;
    AccessibilityInfo.announceForAccessibility(
      `column ${cell.x + 1} row ${cell.y + 1}. ${sceneSpeech(visual, phase)}`,
    );
  }, [cell, visual, phase]);

  const stageStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: interpolate(enter.value, [0, 1], [0.9, 1], Extrapolation.CLAMP) }],
  }));

  if (!cell || !visual) return null;

  const handleClose = () => {
    camera.flyHome();
    onClose();
  };

  const Scene = pickScene(visual, phase);
  const targetable = phase === 'battle' && visual === 'unknown';
  const draftable = phase === 'placement' && (visual === 'unknown' || visual === 'draft');
  const coord = `${COLS.charAt(cell.x)}${cell.y + 1}`;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, wrapperStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="back to the sea"
        onPress={handleClose}
        style={StyleSheet.absoluteFill}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP }]} />
      </Pressable>

      {/* box-none: taps around the stage fall through to the backdrop */}
      <View pointerEvents="box-none" style={styles.center}>
        <Animated.View style={stageStyle}>
          <MetallicFrame
            cornerRadius={radius.lg}
            thickness={FRAME}
            shine={false}
            fill={colors.bg}
            style={{ width: stage, height: stage }}
          >
            <View style={{ width: inner, height: inner }}>
              <Scene key={`${phase}-${visual}`} size={inner} />

              <Text variant="overline" color={colors.ink} style={styles.coord}>
                {coord}
              </Text>

              <View style={styles.controls}>
                {targetable ? (
                  <FireControls disabled={false} onFire={onFire} onClose={handleClose} />
                ) : (
                  <View style={{ gap: spacing.sm }}>
                    {draftable ? (
                      <Button
                        label={visual === 'draft' ? 'lift this one' : 'place a heart here'}
                        tone="secondary"
                        haptic="medium"
                        onPress={onToggleDraft}
                      />
                    ) : null}
                    <Button
                      label="back to the sea"
                      tone={draftable ? 'ghost' : 'secondary'}
                      onPress={handleClose}
                    />
                  </View>
                )}
              </View>
            </View>
          </MetallicFrame>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coord: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: 'rgba(5,7,12,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  controls: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
});
