// ui/Card.tsx — surface container, rimmed in metal.
//
// The rim is a MetallicFrame rather than a borderColor, so a card is a physical
// object with a bevel that catches light instead of a rectangle with a line
// around it.
import { View, type ViewProps, type ViewStyle, StyleSheet } from 'react-native';
import { colors, radius, spacing, elevation } from '../theme/theme';
import {
  MetallicFrame,
  SILVER_METAL,
  BLUE_METAL,
  DANGER_METAL,
  type MetalStops,
} from './MetallicFrame';

type Variant = 'default' | 'raised' | 'quiet' | 'accent' | 'danger';

const VARIANTS: Record<Variant, { bg: string; metal: MetalStops; shadow: boolean; shine: boolean }> = {
  default: { bg: colors.surface, metal: SILVER_METAL, shadow: true, shine: true },
  raised: { bg: colors.raised, metal: SILVER_METAL, shadow: true, shine: true },
  // list rows: still metal, but no sweep — thirty looping shines in one
  // FlashList is thirty animations competing for the UI thread
  quiet: { bg: colors.surface, metal: SILVER_METAL, shadow: false, shine: false },
  // opaque tints, not the `*Soft` rgba ones: the frame masks its metal with
  // this colour, so anything translucent lets the whole gradient through
  accent: { bg: colors.blueTint, metal: BLUE_METAL, shadow: false, shine: true },
  danger: { bg: colors.dangerTint, metal: DANGER_METAL, shadow: false, shine: false },
};

// Callers pass `style` for two different jobs: positioning the card in its
// parent, and laying out its contents. The frame owns the box, the inner view
// owns the contents — so the style has to be split or `flexDirection: 'row'`
// would arrange the metal layers instead of the children.
const BOX_KEYS = new Set([
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'alignSelf', 'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
  'position', 'top', 'left', 'right', 'bottom', 'zIndex', 'opacity', 'transform',
]);

function splitStyle(style: ViewProps['style']): { box: ViewStyle; content: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const box: Record<string, unknown> = {};
  const content: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    (BOX_KEYS.has(k) ? box : content)[k] = v;
  }
  return { box: box as ViewStyle, content: content as ViewStyle };
}

export function Card({
  variant = 'default',
  shine,
  style,
  children,
  ...rest
}: ViewProps & { variant?: Variant; shine?: boolean }) {
  const v = VARIANTS[variant];
  const { box, content } = splitStyle(style);

  return (
    <MetallicFrame
      cornerRadius={radius.md}
      stops={v.metal}
      fill={v.bg}
      shine={shine ?? v.shine}
      style={{ ...(v.shadow ? elevation.card : null), ...box }}
    >
      <View style={[{ padding: spacing.lg }, content]} {...rest}>
        {children}
      </View>
    </MetallicFrame>
  );
}
