// features/games/battleship/ui/BattleshipScreen.tsx — the sea table. One
// tilted sea holds both secrets: hearts are hidden and found on the SAME
// board, the camera dives into the cells, and every game still ends with an
// exit. The old two-grid flat UI is gone.
//
// This screen is only the shell: the loading skeleton, the header strip
// (title + exit), the phase switch, the failure notice, and the result veil.
// Everything you can touch lives in ../sea3d — PlacementMode hides the
// hearts, BattleMode fights over them, ResultVeil closes the game.
import { useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Text, Button, Card, Icon, Skeleton, SkeletonCard } from '../../../../ui';
import { colors, radius, spacing } from '../../../../theme/theme';
import { useBattleship } from '../hooks';
import { useSession, usePartnerName } from '../../../../lib/session/store';
import { useSeaCamera } from '../sea3d/useSeaCamera';
import type { BattlePhase } from '../sea3d/seaTypes';
import { SeaAmbient } from '../sea3d/SeaAmbient';
import { PlacementMode } from '../sea3d/modes/PlacementMode';
import { BattleMode } from '../sea3d/modes/BattleMode';
import { ResultVeil } from '../sea3d/hud/ResultVeil';

// the exit chip: a touchable disc that still reads over bright water
const EXIT_CHIP = spacing.xxl + spacing.sm;

/** Every failed move reads the same: what went wrong, then the way out. */
function FailureNotice({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <Card variant="danger" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Icon name="alert" size={spacing.lg} color={colors.danger} />
        <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
          {message}
        </Text>
      </View>
      <Button label={retryLabel} tone="ghost" onPress={onRetry} />
    </Card>
  );
}

export function BattleshipScreen({ sessionId }: { sessionId: string }) {
  const game = useBattleship(sessionId);
  const userId = useSession((s) => s.userId);
  const partnerName = usePartnerName();
  const camera = useSeaCamera();
  const insets = useSafeAreaInsets();

  const exit = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  // the veil rises over the WHOLE sea — fly home from any dive before it does.
  // Keyed on the summary (a stable string), never on the camera object.
  const outcomeSummary = game.outcome?.summary ?? null;
  useEffect(() => {
    if (outcomeSummary) camera.flyHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once, when the outcome lands
  }, [outcomeSummary]);

  if (game.loading || !game.state) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.xl }}>
        <SkeletonCard lines={1} />
        <Skeleton height={spacing.huge * 5} />
      </View>
    );
  }

  const s = game.state;
  // The phase gate is the LOG, not the local secret: commitFleet stores the
  // fleet BEFORE the commit move lands, so the sea leaves placement only once
  // my commit is folded in (round-6 finding). After that the board is
  // BattleMode's — even while she is still hiding her hearts.
  const iCommitted = s.committed.includes(userId ?? '');
  const phase: BattlePhase = outcomeSummary ? 'over' : iCommitted ? 'battle' : 'placement';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SeaAmbient>
        {phase === 'placement' ? (
          <PlacementMode game={game} camera={camera} />
        ) : (
          <BattleMode game={game} camera={camera} myId={userId ?? ''} />
        )}
      </SeaAmbient>

      {/* header strip: the game's name + the way out, floating over the sea.
          box-none, so the strip never steals the board's own gestures */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + spacing.sm,
          left: spacing.lg,
          right: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Text variant="heading" style={{ flex: 1 }}>
          find my hearts
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="leave the game"
          hitSlop={spacing.sm}
          onPress={exit}
        >
          <View
            style={{
              width: EXIT_CHIP,
              height: EXIT_CHIP,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.line,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="close" size={spacing.lg} color={colors.muted} />
          </View>
        </Pressable>
      </View>

      {/* a failed move surfaces over the sea, bottom-anchored like the trays */}
      {game.lastFailedMove && phase !== 'over' ? (
        <View
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + spacing.lg,
          }}
        >
          <FailureNotice
            message={
              phase === 'placement'
                ? `your sea did not reach ${partnerName}’s phone`
                : `your shot did not reach ${partnerName}’s phone`
            }
            retryLabel={phase === 'placement' ? 'try again' : 'fire again'}
            onRetry={() => void game.retryFailed()}
          />
        </View>
      ) : null}

      {/* every game ends with an exit: the veil over the dimmed board is it */}
      {phase === 'over' && outcomeSummary ? (
        <ResultVeil summary={outcomeSummary} onExit={exit} />
      ) : null}
    </View>
  );
}
