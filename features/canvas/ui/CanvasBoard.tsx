// features/canvas/ui/CanvasBoard.tsx — draw together, live.
// Gesture Handler v2 builder API (Expo SDK 57-bundled ~2.32) + Reanimated 4.
// scheduleOnRN is the Reanimated-4 name for runOnJS (research §reanimated).
import { useCallback, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { Text, Button } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { simplify, BRUSHES, PALETTE, type Stroke, type Point } from '../model';
import { useCanvas, useReplay } from '../hooks';

function StrokeDots({ stroke }: { stroke: Stroke }) {
  return (
    <>
      {stroke.points.map((p, i) => (
        <View
          key={`${stroke.id}-${i}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: p.x - stroke.width / 2,
            top: p.y - stroke.width / 2,
            width: stroke.width,
            height: stroke.width,
            borderRadius: stroke.width / 2,
            backgroundColor: stroke.color,
          }}
        />
      ))}
    </>
  );
}

export function CanvasBoard() {
  const { strokes, commitStroke, clear } = useCanvas();
  const replay = useReplay(strokes);
  const [draft, setDraft] = useState<Point[]>([]);
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [brush, setBrush] = useState<(typeof BRUSHES)[number]>(BRUSHES[0]);

  const addPoint = useCallback((x: number, y: number) => {
    setDraft((prev) => [...prev, { x, y }]);
  }, []);

  const endStroke = useCallback(() => {
    setDraft((prev) => {
      const pts = simplify(prev);
      if (pts.length > 0) void commitStroke(pts, color, brush.width);
      return [];
    });
  }, [commitStroke, color, brush.width]);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      scheduleOnRN(addPoint, e.x, e.y);
    })
    .onUpdate((e) => {
      scheduleOnRN(addPoint, e.x, e.y);
    })
    .onEnd(() => {
      scheduleOnRN(endStroke);
    })
    .onFinalize(() => {
      scheduleOnRN(endStroke);
    });

  const shown = replay.playing ? replay.visible : strokes;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', padding: spacing.sm }}>
        {PALETTE.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} style={{ margin: spacing.xs }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: c,
                borderWidth: color === c ? 3 : 1,
                borderColor: color === c ? colors.ink : colors.line,
              }}
            />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', paddingBottom: spacing.sm }}>
        {BRUSHES.map((b) => (
          <Pressable key={b.name} onPress={() => setBrush(b)} style={{ margin: spacing.xs }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: brush.name === b.name ? colors.rose : colors.line,
                borderRadius: radius.lg,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.md,
              }}
            >
              <Text variant="caption" color={brush.name === b.name ? colors.rose : colors.muted}>
                {b.name}
              </Text>
            </View>
          </Pressable>
        ))}
        <Pressable onPress={replay.play} style={{ margin: spacing.xs }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.gold,
              borderRadius: radius.lg,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
            }}
          >
            <Text variant="caption" color={colors.gold}>
              ▶ replay
            </Text>
          </View>
        </Pressable>
      </View>

      <GestureDetector gesture={pan}>
        <View
          style={{
            flex: 1,
            margin: spacing.lg,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.line,
            overflow: 'hidden',
          }}
        >
          {shown.map((s) => (
            <StrokeDots key={s.id} stroke={s} />
          ))}
          {draft.length > 0 ? (
            <StrokeDots
              stroke={{ id: 'draft', authorId: 'me', seq: 0, points: draft, color, width: brush.width, at: '' }}
            />
          ) : null}
        </View>
      </GestureDetector>

      <View style={{ padding: spacing.lg }}>
        <Button label="wipe it clean, start over" tone="ghost" onPress={() => void clear()} />
      </View>
    </GestureHandlerRootView>
  );
}
