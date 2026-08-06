// features/games/battleship/sea3d/hud/PlacementTray.tsx — placement's bottom
// tray. One guidance line carries all feedback (validateLayout's reason is the
// error AND the green light, same contract as the flat screen), small pips
// count the hearts still to place, and the primary button locks the sea in.
// No loops: a single entrance spring, cancelled on unmount.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  cancelAnimation,
  useReducedMotion,
} from 'react-native-reanimated';
import { Text, Button } from '../../../../../ui';
import { colors, spacing, radius, motion } from '../../../../../theme/theme';

export function PlacementTray({
  remaining,
  valid,
  reason,
  locking,
  onLock,
}: {
  remaining: number[];
  valid: boolean;
  reason: string | null;
  locking: boolean;
  onLock: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const rise = useSharedValue(reducedMotion ? 0 : spacing.huge);

  useEffect(() => {
    if (!reducedMotion) rise.value = withSpring(0, motion.springSoft);
    return () => cancelAnimation(rise);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const trayStyle = useAnimatedStyle(() => ({ transform: [{ translateY: rise.value }] }));

  const donePlacing = remaining.length === 0;
  const nextLength = remaining[0];
  // the hint line is the only feedback while placing — a rejected layout is
  // an error, a good one is the green light for the primary action
  const hint = donePlacing
    ? valid
      ? 'looks perfect. lock it in'
      : (reason ?? '')
    : `place a heart of ${nextLength ?? 0}, in a straight line`;
  const hintColor = donePlacing ? (valid ? colors.blue : colors.danger) : colors.muted;

  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.raised,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.md,
        },
        trayStyle,
      ]}
    >
      <Text variant="small" color={hintColor} style={{ textAlign: 'center' }}>
        {hint}
      </Text>

      {/* hearts still to hide, one pip cluster per heart, one dot per cell */}
      {remaining.length > 0 ? (
        <View
          accessible
          accessibilityLabel={`${remaining.length} hearts left to place`}
          style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.lg }}
        >
          {remaining.map((len, i) => (
            <View
              key={`${len}-${i}`}
              style={{
                flexDirection: 'row',
                gap: spacing.xs,
                // the heart under your finger reads brighter than the rest
                opacity: i === 0 ? 1 : 0.4,
              }}
            >
              {Array.from({ length: len }).map((_, d) => (
                <View
                  key={d}
                  style={{
                    width: spacing.sm,
                    height: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor: i === 0 ? colors.blue : colors.silver,
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <Button
        label="lock in my sea"
        size="lg"
        haptic="medium"
        disabled={!valid}
        loading={locking}
        onPress={onLock}
      />
    </Animated.View>
  );
}
