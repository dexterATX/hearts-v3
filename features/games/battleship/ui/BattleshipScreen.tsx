// features/games/battleship/ui/BattleshipScreen.tsx — hide hearts, find hers.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Text, Button, Card, Icon, Skeleton, SkeletonCard } from '../../../../ui';
import { colors, spacing, radius } from '../../../../theme/theme';
import { useBattleship } from '../hooks';
import { GRID, FLEET, validateLayout, type FleetLayout, type Cell } from '../rules';
import { useSession, usePartnerName } from '../../../../lib/session/store';

/**
 * The whole grid language lives here, so both seas speak it identically:
 *   blue    — progress. my hearts, and the ones I have found.
 *   danger  — damage taken. only ever on my own sea.
 *   glass   — a spent shot (a silver dot) or unknown water.
 * Two grids of 64 cells each is the densest surface in the app; it has to be
 * readable at a glance, so state is carried by fill AND edge, never by a
 * glyph alone.
 */
const CELL_TONES = {
  unknown: { bg: colors.surface, border: colors.line },
  miss: { bg: colors.surfaceAlt, border: colors.line },
  mine: { bg: colors.blueSoft, border: colors.lineBright },
  draft: { bg: colors.blueGlow, border: colors.blue },
  hit: { bg: colors.blueSoft, border: colors.blue },
  sunk: { bg: colors.blueGlow, border: colors.blue },
  damage: { bg: colors.dangerSoft, border: colors.danger },
} as const;

type CellTone = keyof typeof CELL_TONES;
type CellFace = { tone: CellTone; glyph?: string; faded?: boolean };

function GridView({
  size,
  cell,
  onTap,
}: {
  size: number;
  cell: (x: number, y: number) => CellFace;
  onTap?: (x: number, y: number) => void;
}) {
  return (
    // flex + aspectRatio rather than a fixed cell size: the grid fills the
    // column exactly, so the cells stay square and evenly gapped on every phone
    <View style={{ gap: spacing.xs }}>
      {Array.from({ length: size }).map((_, y) => (
        <View key={y} style={{ flexDirection: 'row', gap: spacing.xs }}>
          {Array.from({ length: size }).map((__, x) => {
            const face = cell(x, y);
            const tone = CELL_TONES[face.tone];
            return (
              <Pressable
                key={`${x}-${y}`}
                accessibilityRole={onTap ? 'button' : undefined}
                accessibilityLabel={onTap ? `${x + 1}, ${y + 1}` : undefined}
                disabled={!onTap}
                onPress={() => onTap?.(x, y)}
                style={{ flex: 1, aspectRatio: 1 }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: radius.sm,
                    borderWidth: 3,
                    borderColor: tone.border,
                    backgroundColor: tone.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {face.tone === 'miss' ? (
                    <View
                      style={{
                        width: spacing.sm,
                        height: spacing.sm,
                        borderRadius: radius.pill,
                        backgroundColor: colors.faint,
                      }}
                    />
                  ) : face.glyph ? (
                    <Text variant="body" style={face.faded ? { opacity: 0.4 } : undefined}>
                      {face.glyph}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

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

function SeaLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      variant="overline"
      color={colors.muted}
      style={{ textTransform: 'uppercase', textAlign: 'center' }}
    >
      {children}
    </Text>
  );
}

export function BattleshipScreen({ sessionId }: { sessionId: string }) {
  const game = useBattleship(sessionId);
  const userId = useSession((s) => s.userId);
  const partnerName = usePartnerName();
  const [ships, setShips] = useState<Cell[][]>([]); // completed hearts
  const [draft, setDraft] = useState<Cell[]>([]); // heart being placed

  if (game.loading || !game.state) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.xl }}>
        <SkeletonCard lines={1} />
        <Skeleton height={spacing.huge * 5} />
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

    const layout: FleetLayout = ships.map((cells) => ({ cells }));
    const valid = donePlacing ? validateLayout(layout) : null;
    // the hint line is the only feedback while placing — a rejected layout is
    // an error, a good one is the green light for the primary action
    const hintColor = donePlacing ? (valid && valid.ok ? colors.blue : colors.danger) : colors.muted;

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.xl }}
      >
        <View style={{ gap: spacing.sm }}>
          <Text variant="title" style={{ textAlign: 'center' }}>
            hide your hearts
          </Text>
          <Text variant="small" color={hintColor} style={{ textAlign: 'center' }}>
            {donePlacing
              ? valid && valid.ok
                ? 'looks perfect — lock it in'
                : valid && !valid.ok
                  ? valid.reason
                  : ''
              : `place a heart of ${nextLength} — ${draft.length}/${nextLength} cells, in a straight line`}
          </Text>
        </View>

        <GridView
          size={GRID}
          onTap={tap}
          cell={(x, y) => {
            // the heart under your finger reads brighter than the ones already down
            if (draft.some((c) => c.x === x && c.y === y)) return { tone: 'draft', glyph: '♥️' };
            if (ships.some((cells) => cells.some((c) => c.x === x && c.y === y)))
              return { tone: 'mine', glyph: '♥️' };
            return { tone: 'unknown' };
          }}
        />

        <View style={{ gap: spacing.sm }}>
          <Button
            label="lock in my sea"
            size="lg"
            haptic="medium"
            disabled={!(donePlacing && valid && valid.ok)}
            onPress={() => void game.commitFleet(layout)}
          />
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
          <FailureNotice
            message={`your sea did not reach ${partnerName}’s phone`}
            retryLabel="try again"
            onRetry={() => void game.retryFailed()}
          />
        ) : null}
      </ScrollView>
    );
  }

  if (s.phase === 'placing' && iCommitted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Card variant="quiet" style={{ gap: spacing.md }}>
          <Text variant="title" style={{ textAlign: 'center' }}>
            your hearts are hidden ♥
          </Text>
          <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
            waiting for {partnerName} to hide theirs…
          </Text>
        </Card>
      </View>
    );
  }

  // ── outcome ──────────────────────────────────────────────────────────
  if (game.outcome) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Text variant="display" style={{ textAlign: 'center', marginBottom: spacing.xl }}>
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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.xl }}
    >
      <Card variant={myTurn ? 'accent' : 'quiet'} style={{ paddingVertical: spacing.md }}>
        <Text
          variant="body"
          weight="medium"
          color={myTurn ? colors.blue : colors.muted}
          style={{ textAlign: 'center' }}
        >
          {s.pendingShot
            ? s.pendingShot.by === userId
              ? 'your shot is in the air…'
              : 'a shot is coming — answering…'
            : myTurn
              ? 'your shot — pick a wave'
              : `${partnerName} is aiming…`}
        </Text>
      </Card>

      <View style={{ gap: spacing.md }}>
        <SeaLabel>
          {partnerName}’s sea — {myShots.filter((sh) => sh.result !== 'miss').length} hearts found
        </SeaLabel>
        <GridView
          size={GRID}
          onTap={myTurn && !s.pendingShot ? (x, y) => void game.fire(x, y) : undefined}
          cell={(x, y) => {
            const shot = myShots.find((sh) => sh.x === x && sh.y === y);
            if (!shot) return { tone: 'unknown' };
            if (shot.result === 'miss') return { tone: 'miss' };
            if (shot.result === 'sunk') return { tone: 'sunk', glyph: '💔' };
            return { tone: 'hit', glyph: '♥️' };
          }}
        />
      </View>

      <View style={{ gap: spacing.md }}>
        <SeaLabel>
          your sea — {partnerName}’s shots land here
        </SeaLabel>
        <GridView
          size={GRID}
          cell={(x, y) => {
            const shot = herShots.find((sh) => sh.x === x && sh.y === y);
            const mine = game.myFleet?.some((p) => p.cells.some((c) => c.x === x && c.y === y));
            if (shot) return shot.result === 'miss' ? { tone: 'miss' } : { tone: 'damage', glyph: '💥' };
            return mine ? { tone: 'mine', glyph: '♥️', faded: true } : { tone: 'unknown' };
          }}
        />
      </View>

      {game.lastFailedMove ? (
        <FailureNotice
          message={`your shot did not reach ${partnerName}’s phone`}
          retryLabel="fire again"
          onRetry={() => void game.retryFailed()}
        />
      ) : null}
    </ScrollView>
  );
}
