// arcadeMotion.ts — the arcade's shared motion grammar, so every file
// (cards, backdrop, header, sessions) animates in agreement. These
// characters mirror the mood deck's springs (see MoodDeck.tsx); the
// theme motion tokens stay untouched.

/** soft settle — large gentle movement (entrances, layout shifts) */
export const ARCADE_SPRING_SOFT = { damping: 22, stiffness: 140, mass: 1 };

/** quick, small overshoot — the deck's RESTACK_SPRING character */
export const ARCADE_SPRING = { damping: 16, stiffness: 210, mass: 0.9 };

/** the rise-to-top bounce — the deck's POP_SPRING character */
export const ARCADE_POP = { damping: 14, stiffness: 260, mass: 0.8 };

/** pause before the first card deals in, so the screen settles first */
export const DEAL_LEAD_MS = 120;

/** gap between each card's deal-in */
export const DEAL_STAGGER_MS = 80;

export function dealDelay(index: number): number {
  return DEAL_LEAD_MS + index * DEAL_STAGGER_MS;
}
