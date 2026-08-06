// features/games/battleship/sea3d/modes/BattleMode.tsx — the firing phase on
// the sea table: her sea rendered as the tilted board, tap a wave to dive in,
// fire from the close-up, watch the verdict land, fly home. My own sea is
// deliberately NOT rendered as a second strip here — the two FleetPips rows
// below the board carry that information (damage taken vs hearts found), and
// a static 8x8 echo would fight the close-up for attention.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing } from '../../../../../theme/theme';
import { usePartnerName } from '../../../../../lib/session/store';
import { TOTAL_HEARTS } from '../../rules';
import type { SeaCamera } from '../useSeaCamera';
import type { BattlePhase, CellVisual, CellXY } from '../seaTypes';
import { targetSeaView } from '../seaView';
import { SeaBoard } from '../SeaBoard';
import { SeaCloseUp } from '../SeaCloseUp';
import { TurnRibbon } from '../hud/TurnRibbon';
import { FleetPips } from '../hud/FleetPips';
import { ZoomHint } from '../hud/ZoomHint';

/** how long the verdict scene (foam / heart / wreck) holds before the camera flies home */
const VERDICT_HOLD_MS = 1800;

export function BattleMode({
  game,
  camera,
  myId,
}: {
  game: ReturnType<typeof import('../../hooks').useBattleship>;
  camera: SeaCamera;
  myId: string;
}) {
  const partnerName = usePartnerName();
  const [focus, setFocus] = useState<CellXY | null>(null);
  const [hasFlown, setHasFlown] = useState(false); // ZoomHint lives until the first dive
  // true only between "fire ♥" and the verdict landing — the auto-flyHome is
  // armed by MY shot resolving, never by simply viewing a known cell
  const awaitingVerdict = useRef(false);
  const homeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const s = game.state;
  const cells = s ? targetSeaView(s, myId) : null;
  const canFire = !!s && s.phase === 'firing' && s.turn === myId && !s.pendingShot;

  // The verdict landing IS a state change: targetSeaView flips the focused
  // cell from 'unknown' to miss/hit/sunk and SeaCloseUp crossfades its scene.
  // We only notice it here to schedule the flight home.
  const focusVisual: CellVisual | null =
    focus && cells ? (cells[focus.y]?.[focus.x] ?? null) : null;

  useEffect(() => {
    if (!awaitingVerdict.current || !focus || !focusVisual || focusVisual === 'unknown') return;
    awaitingVerdict.current = false;
    homeTimer.current = setTimeout(() => {
      camera.flyHome();
      setFocus(null);
    }, VERDICT_HOLD_MS);
    return () => {
      if (homeTimer.current) clearTimeout(homeTimer.current);
      homeTimer.current = null;
    };
  }, [focusVisual, focus, camera]);

  useEffect(
    () => () => {
      if (homeTimer.current) clearTimeout(homeTimer.current);
    },
    [],
  );

  const onCellTap = useCallback(
    (c: CellXY) => {
      if (!cells) return;
      const v = cells[c.y]?.[c.x];
      if (!v) return;
      // unknown water is a target, and targeting only exists on your shot;
      // known cells are memories — dive in and look any time, never refire
      if (v === 'unknown' && !canFire) return;
      awaitingVerdict.current = false;
      setHasFlown(true);
      setFocus(c);
      camera.flyTo(c);
      void Haptics.selectionAsync();
    },
    [cells, canFire, camera],
  );

  const onFire = useCallback(() => {
    if (!focus || !canFire) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    awaitingVerdict.current = true; // the close-up stays open on the radar while the shot is in the air
    void game.fire(focus.x, focus.y);
  }, [focus, canFire, game]);

  const onClose = useCallback(() => {
    awaitingVerdict.current = false;
    setFocus(null);
    camera.flyHome();
  }, [camera]);

  if (!s || !cells) return null;

  const phase: BattlePhase = game.outcome ? 'over' : 'battle';
  // damage on MY sea = her shots that landed; hearts found in HER sea = mine.
  // Both come straight from the shared shot log, so both phones agree.
  const myDamage = s.shots.filter((sh) => sh.by !== myId && sh.result !== 'miss' && sh.result !== null).length;
  const herDamage = s.shots.filter((sh) => sh.by === myId && sh.result !== 'miss' && sh.result !== null).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TurnRibbon myTurn={s.turn === myId} waitingOnSetter={s.pendingShot !== null} />

      <View style={{ flex: 1 }}>
        <SeaBoard cells={cells} camera={camera} interactive={s.phase === 'firing'} onCellTap={onCellTap} />

        <SeaCloseUp
          cell={focus}
          visual={focusVisual}
          phase={phase}
          camera={camera}
          onFire={onFire}
          onToggleDraft={() => {}} // drafts belong to placement; nothing to toggle here
          onClose={onClose}
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: spacing.xl,
          paddingVertical: spacing.sm,
        }}
      >
        <FleetPips total={TOTAL_HEARTS} lost={myDamage} label="your sea" />
        <FleetPips total={TOTAL_HEARTS} lost={herDamage} label={`${partnerName}’s sea`} />
      </View>

      <ZoomHint visible={!hasFlown} />
    </View>
  );
}
