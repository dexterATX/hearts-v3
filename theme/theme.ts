// hearts v3 · design tokens — defined once, imported everywhere (spec §5)
export const colors = {
  bg: '#0F0A12',
  surface: '#1B1220',
  surfaceAlt: '#241830',
  line: '#33223D',
  rose: '#FF6B8A',
  roseDeep: '#E8557A',
  gold: '#F5C77E',
  ink: '#F6EDF2',
  muted: '#9A8A96',
} as const;

export const radius = { sm: 8, md: 16, lg: 28 } as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

export const type = {
  display: { fontSize: 32, lineHeight: Math.round(32 * 1.4) },
  title: { fontSize: 24, lineHeight: Math.round(24 * 1.4) },
  body: { fontSize: 17, lineHeight: Math.round(17 * 1.4) },
  small: { fontSize: 15, lineHeight: Math.round(15 * 1.4) },
  caption: { fontSize: 13, lineHeight: Math.round(13 * 1.4) },
} as const;

// springs only — never a linear easing curve (spec §5)
export const motion = {
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
  pressScale: 0.96,
  screenMs: 220,
} as const;

export type Colors = typeof colors;
