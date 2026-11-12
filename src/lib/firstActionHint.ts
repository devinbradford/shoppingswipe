/**
 * First-action hint (Step 6): shoppers who skipped the style rooms have never been shown
 * the swipe, so their very first product card says how it works, in the badge's place.
 * Everyone else goes straight to the furniture. Pure, so it's unit-tested.
 */
import { space } from '@/theme/tokens';

export const HINT_LONG = 'Swipe right to keep · left to skip';
/** Used when the long one wouldn't fit on one line (large text sizes): never half a sentence. */
export const HINT_SHORT = 'Swipe or tap to choose';

export interface FirstActionState {
  /** Set after the first Keep or Skip that actually went through; survives restarts and Undo. */
  firstActionDone: boolean;
  /** Answers from the style rooms (none = they skipped onboarding). */
  roomAnswerCount: number;
  /** Product swipes on record (older installs have history but not the flag). */
  swipeCount: number;
}

export function shouldShowFirstActionHint(s: FirstActionState): boolean {
  return !s.firstActionDone && s.roomAnswerCount === 0 && s.swipeCount === 0;
}

/**
 * Average width of one character of the long hint in DM Sans 12 pt: measured 181 pt for the
 * 34 characters (5.3 pt) in the app, plus about 8% so the check errs towards the short text.
 */
export const HINT_CHAR_WIDTH = 5.75;
/** Room the pill's text gets: screen minus the details' side margins and the pill's padding + border. */
const PILL_CHROME = 2 * space.xl + 2 * (space.md + 2) + 2;
/** The caption style grows at most 2× with the phone's text size (AppText's default cap). */
const MAX_SCALE = 2;

/** The long hint when it fits on one line at this screen width and text size, else the short one. */
export function firstActionHintText(screenWidth: number, fontScale: number): string {
  const scale = Math.min(Math.max(fontScale || 1, 1), MAX_SCALE);
  const room = screenWidth - PILL_CHROME;
  return HINT_LONG.length * HINT_CHAR_WIDTH * scale <= room ? HINT_LONG : HINT_SHORT;
}
