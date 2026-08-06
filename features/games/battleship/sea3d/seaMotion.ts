// sea3d · motion tokens — the sea table's characters, defined once here.
//
// Springs only, same rule as theme.motion (spec §5): movement is always a
// spring, withTiming is reserved for fades and slow ambient loops, never a
// linear easing curve. These four presets cover every movement the table
// makes; pick by feel, not by convenience.

// The water itself. Barely underdamped (critical damping would be ~24), so
// swells and breathing loops settle without a visible wobble. Use for
// anything the sea does on its own.
export const SEA_SOFT = { damping: 22, stiffness: 140, mass: 1 } as const;

// The default move. Clearly underdamped, one confident bounce on arrival —
// markers landing, the tray sliding in, a ship settling into its square.
export const SEA_SPRING = { damping: 16, stiffness: 210, mass: 0.9 } as const;

// The quick answer. Stiff and light with low damping, so it pops with a
// small overshoot — taps, presses, a pin dropping onto a wave.
export const SEA_POP = { damping: 14, stiffness: 260, mass: 0.8 } as const;

// The camera flight. Damping sits just under critical (~21.9), the tightest
// of the four: the dive into a square is fast and smooth and barely
// overshoots, because overshooting water at 5.5x zoom reads as seasickness.
export const CAMERA_FLY = { damping: 20, stiffness: 120, mass: 1 } as const;

// Whole sea in view — the resting zoom, camera home.
export const ZOOM_FAR = 1;

// Nose against the water — close-up zoom, one square fills the table.
export const ZOOM_CLOSE = 5.5;

// The zoom level where the close-up scene crossfades in over the shrinking
// board. Below this the far view carries the detail; past it the scene has
// taken over. SeaCloseUp keys its fade on camera.zoom crossing this.
export const CLOSEUP_FADE_AT = 3;
