// hearts v3 · design tokens — defined once, imported everywhere (spec §5)
//
// DIRECTION: obsidian and steel. A private two-person app that should feel
// like a precision instrument, not a greeting card — blue-black glass, one
// confident electric blue, silver hairlines, and a lot of quiet space.
//
// Every surface is hue ~218° at very low lightness, so the "black" reads
// blue-black rather than muddy grey. Nothing here is a neutral grey; the
// whole ramp is derived from the one anchor hue.

export const colors = {
  // ── surfaces, darkest → lightest ────────────────────────────────────────
  bg: '#05070C', // the page itself
  surface: '#0B1018', // cards, the tab bar
  surfaceAlt: '#121926', // inputs, pressed cards, skeletons
  raised: '#1A2434', // sheets, popovers — the only true "floating" layer

  // ── hairlines. Borders at low contrast beat shadows for crispness ───────
  line: '#1C2434', // default 1px edge
  lineBright: '#2B3547', // emphasis edge, dividers that must be seen

  // ── text ────────────────────────────────────────────────────────────────
  ink: '#E8EEF9', // primary
  muted: '#8D99AE', // secondary — still passes AA for body copy
  faint: '#5A6577', // tertiary/disabled — decorative only, never body copy

  // ── accent: the one blue ────────────────────────────────────────────────
  blue: '#4D8DF7', // accent text, icons, active states
  blueDeep: '#2E6FE3', // filled button background
  blueSoft: 'rgba(77,141,247,0.14)', // tint fill behind blue content
  blueGlow: 'rgba(77,141,247,0.32)', // focus ring / pressed halo
  // blueSoft already composited over `surface`. A MetallicFrame masks its metal
  // with the fill colour, so a translucent fill lets the whole gradient through
  // and the card becomes a solid slab — these are the opaque equivalents.
  blueTint: '#142237',

  // ── secondary accent: silver ────────────────────────────────────────────
  silver: '#C6CFDD', // metallic highlight
  silverSoft: 'rgba(198,207,221,0.10)',

  // ── semantic ────────────────────────────────────────────────────────────
  danger: '#FF6B7D', // errors, destructive — never used decoratively
  dangerSoft: 'rgba(255,107,125,0.13)',
  dangerTint: '#2B1C25', // dangerSoft composited over `surface`, opaque
  success: '#43D6A3',

  // ── foregrounds for filled surfaces ─────────────────────────────────────
  onBlue: '#FFFFFF',
  onSilver: '#05070C',
} as const;

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

// Two faces, deliberately: Sora carries the display sizes (geometric, a little
// technical, excellent numerals for the days-together counter), Inter does
// everything you actually read.
//
// Custom fonts on Android need an explicit family PER WEIGHT — never set
// `fontWeight` alongside these or you get faux-bold on one platform and the
// wrong family on the other. Use <Text weight="..."> instead.
export const fonts = {
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

// Type scale, ~1.25 with the display sizes pulled further apart for hierarchy.
// Body sits at 1.55 line-height for comfortable reading; headings tighten to
// 1.15–1.3 and take negative tracking, which is most of what makes large text
// on a dark background read as designed rather than as a default.
export const type = {
  mega: { fontSize: 72, lineHeight: 76, fontFamily: fonts.display, letterSpacing: -2 },
  hero: { fontSize: 44, lineHeight: 48, fontFamily: fonts.display, letterSpacing: -1.4 },
  display: { fontSize: 30, lineHeight: 36, fontFamily: fonts.display, letterSpacing: -0.7 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: fonts.displaySemi, letterSpacing: -0.35 },
  heading: { fontSize: 17, lineHeight: 23, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 25, fontFamily: fonts.regular, letterSpacing: 0 },
  small: { fontSize: 14, lineHeight: 21, fontFamily: fonts.regular, letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 17, fontFamily: fonts.medium, letterSpacing: 0.2 },
  overline: { fontSize: 11, lineHeight: 14, fontFamily: fonts.semibold, letterSpacing: 1.1 },
} as const;

// One elevation level, and it is mostly a border. Heavy drop shadows read as
// cheap on a near-black background — the hairline does the work.
export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
} as const;

// springs only — never a linear easing curve (spec §5)
export const motion = {
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 140, mass: 1 },
  pressScale: 0.97,
  screenMs: 220,
  fadeMs: 160,
} as const;

export type Colors = typeof colors;
