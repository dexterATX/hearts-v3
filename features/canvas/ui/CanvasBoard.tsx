// features/canvas/ui/CanvasBoard.tsx — draw together, live.
// Gesture Handler v2 builder API (Expo SDK 57-bundled ~2.32) + Reanimated 4.
// scheduleOnRN is the Reanimated-4 name for runOnJS (research §reanimated).
import { useCallback, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { Text, Button } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { simplify, BRUSHES, PALETTE, PALETTE_NAMES, type Stroke, type Point } from '../model';
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
      {/* toolbar: swatches, then brush weight + replay */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
        }}
      >
        {PALETTE.map((c) => {
          const active = color === c;
          return (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={PALETTE_NAMES[c]}
              accessibilityState={{ selected: active }}
              onPress={() => setColor(c)}
            >
              {/* the selection ring sits OUTSIDE the swatch, so picking a
                  colour never changes the colour you are looking at */}
              <View
                style={{
                  padding: spacing.xs,
                  borderRadius: radius.pill,
                  borderWidth: 3,
                  borderColor: active ? colors.blue : 'transparent',
                  backgroundColor: active ? colors.blueSoft : 'transparent',
                }}
              >
                <View
                  style={{
                    width: spacing.xxl,
                    height: spacing.xxl,
                    borderRadius: radius.pill,
                    backgroundColor: c,
                    borderWidth: 3,
                    borderColor: colors.line,
                  }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
        }}
      >
        {BRUSHES.map((b) => {
          const active = brush.name === b.name;
          return (
            <Pressable
              key={b.name}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setBrush(b)}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  borderWidth: 3,
                  borderColor: active ? colors.blue : colors.line,
                  backgroundColor: active ? colors.blueSoft : 'transparent',
                  borderRadius: radius.pill,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                }}
              >
                {/* the dot IS the brush weight — read it without reading it */}
                <View
                  style={{
                    width: b.width,
                    height: b.width,
                    borderRadius: radius.pill,
                    backgroundColor: active ? colors.blue : colors.muted,
                  }}
                />
                <Text variant="caption" color={active ? colors.blue : colors.muted}>
                  {b.name}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <Button label="replay" tone="ghost" onPress={replay.play} />
      </View>

      <GestureDetector gesture={pan}>
        <View
          style={{
            flex: 1,
            margin: spacing.lg,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: 3,
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

      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}>
        <Button label="wipe it clean, start over" tone="danger" onPress={() => void clear()} />
      </View>
    </GestureHandlerRootView>
  );
}
