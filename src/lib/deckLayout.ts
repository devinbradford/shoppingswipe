/**
 * Vertical layout of the swipe deck (For you, room decks, weekly): where the photo card,
 * the product details and the Skip / Undo / Keep buttons sit. Worked out from the screen
 * size, safe areas and the phone's text size, so it fits every phone without fixed
 * assumptions, and stays the same from one card to the next (nothing jumps).
 *
 * Pure arithmetic; unit-tested in __tests__/deckLayout.test.ts.
 */
import { space, type as typeScale } from '@/theme/tokens';

/** The card's name and price grow at most this much with the phone's text size (see AppText). */
export const CARD_TEXT_MAX_SCALE = 1.3;
/** Other text (the "For you" pill, store name) grows at most this much (AppText's default cap). */
const OTHER_TEXT_MAX_SCALE = 2;

/** Skip / Keep button size (unchanged: full-size controls). */
export const ACTION_BUTTON = 66;
/** The SKIP / KEEP caption under each button (gap + one line of small capitals); it grows with text size. */
const actionCaption = (other: number) => space.sm + typeScale.eyebrow.lineHeight * other;

/** Decorative spacing. Normal phones get the roomy set; if the photo would get too small, the tight set. */
interface Spacing {
  /** From the photo progress lines to the top of the photo area. */
  photoTop: number;
  /** Between the photo area and the details. */
  photoGap: number;
  /** Between the details and the button captions' top. */
  toButtons: number;
}
/** Header bottom (12 + 44 pt below the progress lines) plus 4 pt. */
const ROOMY_PHOTO_TOP = 60;
const ROOMY: Spacing = { photoTop: ROOMY_PHOTO_TOP, photoGap: 20, toButtons: space.xl };
// The photo never moves up under the header (a 44 pt control 12 pt below the progress lines,
// whatever the text size), so only the gaps around the details tighten.
const TIGHT: Spacing = { photoTop: ROOMY_PHOTO_TOP, photoGap: 12, toButtons: space.lg };
/** Below this photo height (pt) the decorative spacing tightens before anything essential shrinks. */
const MIN_ROOMY_PHOTO = 220;

/** The "For you" pill: padding + border + its tallest line (the italic reason). */
const PILL_CHROME = space.sm * 2 + 2;
const PILL_MARGIN = space.xs;
/** Gap between the pill, the name and the price row. */
const INFO_GAP = space.sm;

export interface DeckLayoutInput {
  /** Screen height (pt). */
  height: number;
  /** Top of the photo progress lines (safe area included). */
  pipsTop: number;
  /** Height of whatever covers the bottom (tab bar or home indicator area). */
  bottomInset: number;
  /** The phone's text-size setting (1 = default). */
  fontScale: number;
}

export interface DeckLayout {
  /** Distance from the bottom of the screen to the buttons. */
  actionsBottom: number;
  /** Distance from the bottom of the screen to the bottom of the product details. */
  infoBottom: number;
  /** Height the details need: pill, two-line name and price row, at this text size. */
  infoHeight: number;
  /** Distance from the top of the screen to the top of the photo area. */
  photoTop: number;
  /** Distance from the bottom of the screen to the bottom of the photo area. */
  photoBottom: number;
  /** How much the name and price grow with the text size. */
  titleScale: number;
  /** True when the decorative spacing was tightened to keep the photo a usable size. */
  tight: boolean;
}

/** Height of the product details block at a given text size (always reserves the pill and two name lines). */
export function infoHeight(fontScale: number): number {
  const fs = Math.max(fontScale || 1, 1);
  const card = Math.min(fs, CARD_TEXT_MAX_SCALE);
  const other = Math.min(fs, OTHER_TEXT_MAX_SCALE);
  const pillLine = Math.max(typeScale.caption.lineHeight, typeScale.italic.lineHeight) * other;
  const pill = PILL_CHROME + pillLine + PILL_MARGIN;
  const name = typeScale.cardTitle.lineHeight * 2 * card;
  const priceRow = Math.max(typeScale.cardPrice.lineHeight * card, typeScale.eyebrow.lineHeight * other);
  return Math.ceil(pill + INFO_GAP + name + INFO_GAP + priceRow);
}

export function deckLayout({ height, pipsTop, bottomInset, fontScale }: DeckLayoutInput): DeckLayout {
  const titleScale = Math.min(Math.max(fontScale || 1, 1), CARD_TEXT_MAX_SCALE);
  const other = Math.min(Math.max(fontScale || 1, 1), OTHER_TEXT_MAX_SCALE);
  const info = infoHeight(fontScale);
  const buttons = ACTION_BUTTON + actionCaption(other);
  const actionsBottom = bottomInset + space.lg;
  const build = (s: Spacing) => {
    const infoBottom = actionsBottom + buttons + s.toButtons;
    const photoTop = pipsTop + s.photoTop;
    const photoBottom = infoBottom + info + s.photoGap;
    return { infoBottom, photoTop, photoBottom, photoHeight: height - photoTop - photoBottom };
  };
  const roomy = build(ROOMY);
  const tight = roomy.photoHeight < MIN_ROOMY_PHOTO;
  const s = tight ? build(TIGHT) : roomy;
  return {
    actionsBottom,
    infoBottom: s.infoBottom,
    infoHeight: info,
    photoTop: s.photoTop,
    photoBottom: s.photoBottom,
    titleScale,
    tight,
  };
}
