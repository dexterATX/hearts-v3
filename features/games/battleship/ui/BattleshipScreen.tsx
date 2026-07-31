// features/games/battleship/ui/BattleshipScreen.tsx — hide hearts, find hers.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Text, Button, Card, Skeleton } from '../../../../ui';
import { colors, spacing, radius } from '../../../../theme/theme';
import { useBattleship } from '../hooks';
import { GRID, FLEET, validateLayout, type FleetLayout, type Cell } from '../rules';
import { useSession } from '../../../../lib/session/store';

const CELL_SIZE = 34;

function GridView({
  size,
  renderCell,
  onTap,
}: {
  size: number;
  renderCell: (x: number, y: number) => React.ReactNode;
  onTap?: (x: number, y: number) => void;
}) {
  return (
    <View style={{ alignItems: 'center' }}>
      {Array.from({ length: size }).map((_, y) => (
        <View key={y} style={{ flexDirection: 'row' }}>
          {Array.from({ length: size }).map((__, x) => (
            <Pressable key={`${x}-${y}`} disabled={!onTap} onPress={() => onTap?.(x, y)}>
              <View
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  margin: 1,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {renderCell(x, y)}
              </View>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

export function BattleshipScreen({ sessionId }: { sessionId: string }) {
  const game = useBattleship(sessionId);
  const userId = useSession((s) => s.userId);
  const partnerName = useSession((s) => s.partner?.nickname || s.partner?.display_name || 'her');
  const [ships, setShips] = useState<Cell[][]>([]); // completed hearts
  const [draft, setDraft] = useState<Cell[]>([]); // heart being placed

  if (game.loading || !game.state) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
        <Skeleton height={300} />
      </View>
    );
  }

  const s = game.state;
  // The UI gate is the LOG, not the local secret: commitFleet stores the
  // fleet BEFORE the commit move lands, so a failed commit must not strand
  // the player on the "waiting for her" screen (round-6 finding).
  const iCommitted = s.committed.includes(userId ?? '');

  // ── placement phase ──────────────────────────────────────────────────
  if (s.phase === 'placing' && !iCommitted) {
    const nextLength = FLEET[ships.length] as number | undefined;
    const donePlacing = ships.length === FLEET.length;

    const tap = (x: number, y: number) => {
      if (donePlacing || !nextLength) return;
      if (draft.some((c) => c.x === x && c.y === y)) return;
      if (ships.some((cells) => cells.some((c) => c.x === x && c.y === y))) return;
      const next = [...draft, { x, y }];
      if (next.length === nextLength) {
        setShips((prev) => [...prev, next]);
        setDraft([]);
      } else {
        setDraft(next);
      }
    };

    const placed = [...ships, ...(draft.length > 0 ? [draft] : [])];
    const layout: FleetLayout = ships.map((cells) => ({ cells }));
    const valid = donePlacing ? validateLayout(layout) : null;

    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <Text variant="title" style={{ textAlign: 'center', marginBottom: spacing.sm }}>
          hide your hearts
        </Text>
        <Text variant="small" color={colors.muted} style={{ textAlign: 'center', marginBottom: spacing.lg }}>
          {donePlacing
            ? valid && valid.ok
              ? 'looks perfect — lock it in'
              : valid && !valid.ok
                ? valid.reason
                : ''
            : `place a heart of ${nextLength} — ${draft.length}/${nextLength} cells, in a straight line`}
        </Text>
        <GridView
          size={GRID}
          onTap={tap}
          renderCell={(x, y) =>
            placed.some((cells) => cells.some((c) => c.x === x && c.y === y)) ? (
              <Text variant="small">♥️</Text>
            ) : null
          }
        />
        <View style={{ marginTop: spacing.xl }}>
          <Button
            label="lock in my sea"
            haptic="medium"
            disabled={!(donePlacing && valid && valid.ok)}
            onPress={() => void game.commitFleet(layout)}
          />
          <View style={{ marginTop: spacing.sm }}>
            <Button
              label="start over"
              tone="ghost"
              onPress={() => {
                setShips([]);
                setDraft([]);
              }}
            />
          </View>
          {game.lastFailedMove ? (
            <View style={{ marginTop: spacing.md }}>
              <Text variant="small" color={colors.rose} style={{ textAlign: 'center', marginBottom: spacing.sm }}>
                your sea did not reach her phone
              </Text>
              <Button label="try again" tone="ghost" onPress={() => void game.retryFailed()} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  if (s.phase === 'placing' && iCommitted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Text variant="title" style={{ textAlign: 'center' }}>
          your hearts are hidden ♥
        </Text>
        <Text variant="body" color={colors.muted} style={{ textAlign: 'center', marginTop: spacing.md }}>
          waiting for {partnerName} to hide hers…
        </Text>
      </View>
    );
  }

  // ── outcome ──────────────────────────────────────────────────────────
  if (game.outcome) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Text variant="display" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
          ♥️
        </Text>
        <Text variant="title" style={{ textAlign: 'center' }}>
          {game.outcome.summary}
        </Text>
      </View>
    );
  }

  // ── firing phase: two seas ───────────────────────────────────────────
  const myShots = s.shots.filter((shot) => shot.by === userId);
  const herShots = s.shots.filter((shot) => shot.by !== userId);
  const myTurn = s.turn === userId;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text variant="body" color={myTurn ? colors.rose : colors.muted} style={{ textAlign: 'center', marginBottom: spacing.md }}>
        {s.pendingShot
          ? s.pendingShot.by === userId
            ? 'your shot is in the air…'
            : 'a shot is coming — answering…'
          : myTurn
            ? 'your shot — pick a wave'
            : `${partnerName} is aiming…`}
      </Text>

      <Text variant="caption" color={colors.gold} style={{ textAlign: 'center', marginBottom: spacing.xs }}>
        her sea — {myShots.filter((sh) => sh.result !== 'miss').length} hearts found
      </Text>
      <GridView
        size={GRID}
        onTap={myTurn && !s.pendingShot ? (x, y) => void game.fire(x, y) : undefined}
        renderCell={(x, y) => {
          const shot = myShots.find((sh) => sh.x === x && sh.y === y);
          if (!shot) return null;
          if (shot.result === 'miss') return <Text variant="caption" color={colors.muted}>○</Text>;
          if (shot.result === 'sunk') return <Text variant="caption">💔</Text>;
          return <Text variant="caption">♥️</Text>;
        }}
      />

      <View style={{ height: spacing.xl }} />

      <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', marginBottom: spacing.xs }}>
        your sea — her shots land here
      </Text>
      <GridView
        size={GRID}
        renderCell={(x, y) => {
          const shot = herShots.find((sh) => sh.x === x && sh.y === y);
          const mine = game.myFleet?.some((p) => p.cells.some((c) => c.x === x && c.y === y));
          if (shot) {
            return shot.result === 'miss' ? (
              <Text variant="caption" color={colors.muted}>○</Text>
            ) : (
              <Text variant="caption">💥</Text>
            );
          }
          return mine ? <Text variant="caption" style={{ opacity: 0.4 }}>♥️</Text> : null;
        }}
      />

      {game.lastFailedMove ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text variant="small" color={colors.rose} style={{ marginBottom: spacing.sm }}>
            your shot did not reach her phone
          </Text>
          <Button label="fire again" tone="ghost" onPress={() => void game.retryFailed()} />
        </Card>
      ) : null}
    </ScrollView>
  );
}
