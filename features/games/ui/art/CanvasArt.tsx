// features/games/ui/art/CanvasArt.tsx — the shared canvas, drawing itself.
//
// Four pressure-sensitive strokes (blue, silver, faint, plus a short playful
// zigzag in blueSoft) draw on one after another. Each stroke is a TAPERED
// FILLED path — its outline is computed once at module load by walking the
// cubic's arc length and offsetting ±a pressure profile along the normals
// (thin at the caps, a swell mid-stroke) — and filled with a subtle gradient
// lit from the shared top-left key light. Because this react-native-svg has
// no pathLength, every centerline is still sampled into a point list with
// cumulative arc lengths at load (the zigzag is subdivided the same way), so
// the pen tip is an exact point-at-length walk and the reveal is a clip rect
// that wipes to the nib's x (every stroke runs left → right). The pen is a
// bright core dot inside a soft glow halo, squashing horizontally with eased
// speed (rx 1↔0.85) like a real nib under pressure. The finished page holds a
// beat, then erases as a quick fade followed by 300ms of blank paper before
// the cycle restarts — the loop boundary lands on the blank page, so the
// repeat never jolts. Three faint hairlines give the page a paper texture.
// One repeating clock drives the whole loop; every stroke derives its clip,
// pen tip and opacity from it per frame (UI thread only; withTiming is the
// ambient-loop allowance). Reduced motion: the finished page, statically.
import { useEffect, useState } from 'react';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors } from '../../../../theme/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// the loop: four draws, a hold, a quick fade erase, 300ms of blank paper
const DRAW = 1600;
const STAGGER = 500;
const HOLD_UNTIL = 3600; // the last stroke lands at 3100; the page rests a beat
const FADE = 350;
const BLANK = 300;
const CYCLE = HOLD_UNTIL + FADE + BLANK;

// peak eased progress per 16ms frame — easeInOutCubic's derivative tops out at
// 3 per unit t, and t spans DRAW milliseconds
const PEAK_FRAME = 3 * (16 / DRAW);

// every stroke reduces to a tapered outline + a flat centerline point list
// with cumulative arc lengths, so clip math and pen-tip tracking share one
// code path for cubics and the zigzag
type Stroke = {
  d: string; // the tapered, fillable outline
  pts: number[]; // centerline, flat x,y pairs
  cum: number[]; // cum[i] = arc length at pts[i]
  len: number;
  color: string; // base ink, bottom-right of the key light
  hi: string; // ink lifted toward the key light
  opacity: number;
};

function cubicAt(a: number, b: number, c: number, d: number, u: number) {
  'worklet';
  const v = 1 - u;
  return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
}

// pen pressure along the stroke: a light touch-down, a swell through the
// middle, easing off toward lift-off — thin caps, thick body
function widthProfile(u: number) {
  return 0.28 + 0.72 * Math.sin(Math.PI * Math.pow(u, 0.85));
}

// lift an ink colour toward the top-left key light (accepts #rrggbb or rgba())
function towardWhite(c: string, t: number): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1] as string, 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return c;
    const parts = (m[1] as string).split(',').map(Number);
    r = parts[0] ?? 0;
    g = parts[1] ?? 0;
    b = parts[2] ?? 0;
    a = parts[3] ?? 1;
  }
  const mix = (v: number) => Math.round(v + (255 - v) * t);
  return `rgba(${mix(r)},${mix(g)},${mix(b)},${a})`;
}

// walk the centerline and offset ±widthProfile along the unit normals:
// fore edge out along the stroke, aft edge back, closed at the thin cap
function buildOutline(pts: number[], cum: number[], len: number, maxW: number): string {
  const count = pts.length / 2;
  const fore: string[] = [];
  const aft: string[] = [];
  for (let i = 0; i < count; i++) {
    const px = pts[i * 2] as number;
    const py = pts[i * 2 + 1] as number;
    const ax = pts[Math.max(0, i - 1) * 2] as number;
    const ay = pts[Math.max(0, i - 1) * 2 + 1] as number;
    const bx = pts[Math.min(count - 1, i + 1) * 2] as number;
    const by = pts[Math.min(count - 1, i + 1) * 2 + 1] as number;
    let tx = bx - ax;
    let ty = by - ay;
    const m = Math.hypot(tx, ty) || 1;
    tx /= m;
    ty /= m;
    const u = (cum[i] as number) / len;
    const half = (widthProfile(u) * maxW) / 2;
    fore.push(`${px - ty * half} ${py + tx * half}`);
    aft.unshift(`${px + ty * half} ${py - tx * half}`);
  }
  return `M ${fore.join(' L ')} L ${aft.join(' L ')} Z`;
}

function buildStroke(
  points: { x: number; y: number }[],
  color: string,
  maxW: number,
  opacity: number,
): Stroke {
  const pts: number[] = [];
  const cum: number[] = [0];
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as { x: number; y: number };
    pts.push(p.x, p.y);
    if (i > 0) {
      const q = points[i - 1] as { x: number; y: number };
      len += Math.hypot(p.x - q.x, p.y - q.y);
      cum.push(len);
    }
  }
  return {
    d: buildOutline(pts, cum, len, maxW),
    pts,
    cum,
    len,
    color,
    hi: towardWhite(color, 0.35),
    opacity,
  };
}

function stroke(
  from: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  maxW: number,
  opacity: number,
): Stroke {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    points.push({
      x: cubicAt(from.x, c1.x, c2.x, to.x, u),
      y: cubicAt(from.y, c1.y, c2.y, to.y, u),
    });
  }
  return buildStroke(points, color, maxW, opacity);
}

function zigzag(
  points: { x: number; y: number }[],
  color: string,
  maxW: number,
  opacity: number,
): Stroke {
  // subdivide each segment so the taper and the pen ride smoothly, not joint to joint
  const dense: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as { x: number; y: number };
    const b = points[i + 1] as { x: number; y: number };
    for (let k = 0; k < 8; k++) {
      dense.push({ x: a.x + ((b.x - a.x) * k) / 8, y: a.y + ((b.y - a.y) * k) / 8 });
    }
  }
  dense.push(points[points.length - 1] as { x: number; y: number });
  return buildStroke(dense, color, maxW, opacity);
}

const STROKES: Stroke[] = [
  stroke({ x: 8, y: 34 }, { x: 18, y: 14 }, { x: 32, y: 48 }, { x: 46, y: 24 }, colors.blue, 2.6, 1),
  stroke({ x: 10, y: 44 }, { x: 20, y: 36 }, { x: 32, y: 52 }, { x: 46, y: 40 }, colors.silver, 2, 0.85),
  stroke({ x: 10, y: 16 }, { x: 18, y: 8 }, { x: 30, y: 22 }, { x: 44, y: 10 }, colors.faint, 1.8, 0.9),
  zigzag(
    [
      { x: 12, y: 51 },
      { x: 17, y: 47 },
      { x: 22, y: 51 },
      { x: 27, y: 47 },
      { x: 32, y: 51 },
    ],
    colors.blueSoft,
    2.2,
    1,
  ),
];

// paper grain: ultra-faint ruled hairlines behind the ink
const PAPER_Y = [14, 26, 38, 50];

// per-instance id minter, so gradient and clip ids never collide across cards
let uid = 0;

function clamp01(v: number) {
  'worklet';
  return Math.max(0, Math.min(1, v));
}

// pen feel: a stroke accelerates off the nib and settles into its endpoint
function easeInOutCubic(t: number) {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// exact point at arc-length fraction u along the stroke (axis: 0 = x, 1 = y)
function pointAt(s: Stroke, u: number, axis: number) {
  'worklet';
  const target = u * s.len;
  let i = 1;
  while (i < s.cum.length - 1 && (s.cum[i] as number) < target) i++;
  const c1 = s.cum[i - 1] as number;
  const c2 = s.cum[i] as number;
  const seg = c2 - c1;
  const t = seg > 0 ? (target - c1) / seg : 0;
  const a = s.pts[(i - 1) * 2 + axis] as number;
  const b = s.pts[i * 2 + axis] as number;
  return a + (b - a) * t;
}

function DrawnStroke({
  stroke: s,
  index,
  clock,
  gradId,
  clipId,
}: {
  stroke: Stroke;
  index: number;
  clock: SharedValue<number>;
  gradId: string;
  clipId: string;
}) {
  const start = index * STAGGER;

  // the reveal wipe: a clip rect that grows to the nib's x as ink lands
  const clipProps = useAnimatedProps(() => {
    const u = easeInOutCubic(clamp01((clock.value - start) / DRAW));
    return { width: u <= 0 ? 0 : pointAt(s, u, 0) + 2 };
  });

  // the erase: a quick fade of the whole page after the hold
  const inkProps = useAnimatedProps(() => {
    const fade = clamp01((clock.value - HOLD_UNTIL) / FADE);
    const on = clock.value > start && fade < 1;
    return { opacity: on ? s.opacity * (1 - fade) : 0 };
  });

  // the glow halo riding the nib while the pen is down; it lifts when the
  // stroke completes and stays up through the erase
  const haloProps = useAnimatedProps(() => {
    const raw = clamp01((clock.value - start) / DRAW);
    const u = easeInOutCubic(raw);
    const down = interpolate(raw, [0, 0.05, 0.95, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
    return {
      cx: pointAt(s, u, 0),
      cy: pointAt(s, u, 1),
      opacity: down * 0.22,
    };
  });

  // the bright nib core: squashes horizontally with eased speed (area kept by
  // growing ry), like a real pen tip loaded with pressure
  const coreProps = useAnimatedProps(() => {
    const raw = clamp01((clock.value - start) / DRAW);
    const u = easeInOutCubic(raw);
    const down = interpolate(raw, [0, 0.05, 0.95, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
    const prev = easeInOutCubic(clamp01((clock.value - 16 - start) / DRAW));
    const v = clamp01((u - prev) / PEAK_FRAME);
    const sx = 1 - 0.15 * v;
    return {
      cx: pointAt(s, u, 0),
      cy: pointAt(s, u, 1),
      rx: 1.5 * sx,
      ry: 1.5 / sx,
      opacity: down,
    };
  });

  return (
    <>
      <ClipPath id={clipId}>
        <AnimatedRect x={0} y={0} width={0} height={56} animatedProps={clipProps} />
      </ClipPath>
      <AnimatedPath
        d={s.d}
        fill={`url(#${gradId})`}
        clipPath={`url(#${clipId})`}
        opacity={0}
        animatedProps={inkProps}
      />
      <AnimatedCircle r={4.5} fill={s.color} opacity={0} animatedProps={haloProps} />
      <AnimatedEllipse rx={1.5} ry={1.5} fill={s.hi} opacity={0} animatedProps={coreProps} />
    </>
  );
}

export function CanvasArt({ size = 56 }: { size?: number }) {
  const reduced = useReducedMotion();
  const clock = useSharedValue(0);
  const [inst] = useState(() => ++uid);

  useEffect(() => {
    if (reduced) return;
    clock.value = 0;
    clock.value = withRepeat(withTiming(CYCLE, { duration: CYCLE }), -1, false);
    return () => cancelAnimation(clock);
  }, [reduced, clock]);

  // one key light, top-left, shared by every ink fill
  const defs = (
    <Defs>
      {STROKES.map((s, i) => (
        <LinearGradient key={i} id={`cg-${inst}-${i}`} x1={0} y1={0} x2={0.7} y2={1}>
          <Stop offset={0} stopColor={s.hi} />
          <Stop offset={1} stopColor={s.color} />
        </LinearGradient>
      ))}
    </Defs>
  );

  const paper = PAPER_Y.map((y) => (
    <Line
      key={y}
      x1={7}
      y1={y}
      x2={49}
      y2={y}
      stroke={colors.line}
      strokeWidth={0.4}
      opacity={0.3}
    />
  ));

  // reduced motion: the finished page — every stroke fully drawn, nothing moves
  if (reduced) {
    return (
      <Svg width={size} height={size} viewBox="0 0 56 56">
        {defs}
        {paper}
        {STROKES.map((s, i) => (
          <Path key={i} d={s.d} fill={`url(#cg-${inst}-${i})`} opacity={s.opacity} />
        ))}
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      {defs}
      {paper}
      {STROKES.map((s, i) => (
        <DrawnStroke
          key={i}
          stroke={s}
          index={i}
          clock={clock}
          gradId={`cg-${inst}-${i}`}
          clipId={`cc-${inst}-${i}`}
        />
      ))}
    </Svg>
  );
}
