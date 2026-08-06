// features/games/battleship/sea3d/modes/PlacementMode.tsx — hiding hearts on
// the sea table. The draft state machine is a straight port of the flat
// screen's placement logic (BattleshipScreen.tsx): taps append to the current
// heart's run, a run locks into the local fleet list the moment it reaches
// its length, and validateLayout only speaks once every heart is down. One
// deliberate upgrade, per spec: tapping a draft cell now pulls it back out
// of the run instead of ignoring the touch. Every tap also sends the camera
// diving into the square (flyTo); a 'zoom out' ghost brings the sea home.
//
// The commit gate is the LOG, never the local secret (round-6 finding):
// commitFleet stores the fleet before the move lands, so a failed commit
// rolls back to the board with a retryable notice instead of stranding the
// player on the waiting card.
//
// No loops live here — the tray springs in once, BoardCell owns its press
// dip, MarkerDraft owns the only pulse (LOD budget). Nothing to cancel.
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button, Card, Icon, Text } from '../../../../../ui';
import { colors, spacing } from '../../../../../theme/theme';
import { usePartnerName, useSession } from '../../../../../lib/session/store';
import { FLEET, validateLayout, type Cell, type FleetLayout } from '../../rules';
import { SeaBoard } from '../SeaBoard';
import { draftView } from '../seaView';
import { PlacementTray } from '../hud/PlacementTray';
import type { SeaCamera } from '../useSeaCamera';
import type { CellXY } from '../seaTypes';

export function PlacementMode({
  game,
  camera,
}: {
  game: ReturnType<typeof import('../../hooks').useBattleship>;
  camera: SeaCamera;
}) {
  const userId = useSession((s) => s.userId);
  const partnerName = usePartnerName();
  const [ships, setShips] = useState<Cell[][]>([]); // completed hearts
  const [draft, setDraft] = useState<Cell[]>([]); // heart being placed
  const [locking, setLocking] = useState(false);

  const s = game.state;
  const nextLength = FLEET[ships.length] as number | undefined;
  const donePlacing = ships.length === FLEET.length;
  const iCommitted = !!s && s.committed.includes(userId ?? '');

  const layout: FleetLayout = useMemo(() => ships.map((cells) => ({ cells })), [ships]);
  const cells = useMemo(() => draftView(layout, draft), [layout, draft]);
  // the layout only earns a verdict once every heart is down; until then the
  // tray's guidance line just names the heart under your finger
  const check = donePlacing ? validateLayout(layout) : null;
  const valid = donePlacing && !!check && check.ok;
  const reason = check && !check.ok ? check.reason : null;
  const remaining: number[] = FLEET.slice(ships.length);

  const tap = (c: CellXY) => {
    camera.flyTo(c); // delight first: the camera dives to the square you touched
    if (donePlacing || !nextLength) return;
    // tapping a draft cell pulls it back out of the run
    if (draft.some((d) => d.x === c.x && d.y === c.y)) {
      setDraft((prev) => prev.filter((d) => !(d.x === c.x && d.y === c.y)));
      return;
    }
    if (ships.some((placed) => placed.some((p) => p.x === c.x && p.y === c.y))) return;
    const next = [...draft, c];
    if (next.length === nextLength) {
      // a full run locks into the fleet list; the next tap starts a new heart
      setShips((prev) => [...prev, next]);
      setDraft([]);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      setDraft(next);
    }
  };

  const startOver = () => {
    setShips([]);
    setDraft([]);
    camera.flyHome();
  };

  const lock = async () => {
    if (!valid) return;
    setLocking(true);
    try {
      // the log's committed flag takes over from here — same gate as the flat
      // screen, so a failed write rolls back to this board with the notice
      await game.commitFleet(layout);
    } finally {
      setLocking(false);
    }
  };

  // the state is still folding in — the parent screen owns the skeleton
  if (!s) return null;

  // committed: the sea keeps my hearts, the card waits on hers. Same copy and
  // same gate as the flat screen; the board stays but stops answering.
  if (iCommitted) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <SeaBoard cells={cells} camera={camera} interactive={false} onCellTap={() => {}} />
        </View>
        <View style={{ padding: spacing.lg }}>
          <Card variant="quiet" style={{ gap: spacing.md }}>
            <Text variant="title" style={{ textAlign: 'center' }}>
              your hearts are hidden ♥
            </Text>
            <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
              waiting for {partnerName} to hide theirs…
            </Text>
          </Card>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <SeaBoard cells={cells} camera={camera} interactive onCellTap={tap} />
      </View>

      {/* camera + scratch controls — ghosts only, the tray owns the primary */}
      {camera.focus || ships.length + draft.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: spacing.md,
            paddingVertical: spacing.xs,
          }}
        >
          {camera.focus ? (
            <Button label="zoom out" tone="ghost" onPress={() => camera.flyHome()} />
          ) : null}
          {ships.length + draft.length > 0 ? (
            <Button label="start over" tone="ghost" onPress={startOver} />
          ) : null}
        </View>
      ) : null}

      {/* every failed move reads the same: what went wrong, then the way out */}
      {game.lastFailedMove ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          <Card variant="danger" style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Icon name="alert" size={spacing.lg} color={colors.danger} />
              <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
                your sea did not reach {partnerName}’s phone
              </Text>
            </View>
            <Button
              label="try again"
              tone="ghost"
              onPress={() => void game.retryFailed()}
            />
          </Card>
        </View>
      ) : null}

      <PlacementTray
        remaining={remaining}
        valid={valid}
        reason={reason}
        locking={locking}
        onLock={() => void lock()}
      />
    </View>
  );
}
