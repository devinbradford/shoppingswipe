/**
 * Things the shopper does besides swiping, and their answers to the occasional
 * "Not into bouclé?" question. Recorded on the phone; the taste model reads them.
 *
 * Pure types and constants: no React, no I/O (see engine.ts).
 */

export type SignalType =
  /** Opened the product page. */
  | 'detail_open'
  /** Tapped through to another photo of the product. */
  | 'photo_browse'
  /** Added the product to a named list. */
  | 'list_add'
  /** Tapped Buy now. The strongest sign of love there is. */
  | 'buy_click'
  /** Removed a kept product from Kept later on: a change of heart. */
  | 'unsave'
  /** How long the card was on top before it was swiped (`value`, ms). */
  | 'swipe_dwell';

export interface EngagementSignal {
  id: string;
  productId: string;
  type: SignalType;
  /** Epoch milliseconds. */
  at: number;
  /** swipe_dwell only: milliseconds. */
  value?: number;
}

/** Feature-level answer: "Not into bouclé?" → less (show less) or fine (those skips weren't about bouclé). */
export interface FeatureFeedback {
  id: string;
  at: number;
  kind: 'feature';
  /** Taste-profile key, e.g. `material:boucle`. */
  featureKey: string;
  answer: 'less' | 'fine';
}

export type SkipReason = 'style' | 'price' | 'color' | 'material';

/** "What put you off?" after a surprising skip. */
export interface SkipReasonFeedback {
  id: string;
  at: number;
  kind: 'skip_reason';
  productId: string;
  reason: SkipReason;
}

export type Feedback = FeatureFeedback | SkipReasonFeedback;

/**
 * How much each action says about taste, in "keeps". A keep is +1, a plain
 * skip −0.6 (see DEFAULT_OPTIONS.skipWeight). Each product counts at most once
 * per signal type, except photo browsing which is capped.
 */
export const SIGNAL_WEIGHTS: Record<Exclude<SignalType, 'swipe_dwell'>, number> = {
  buy_click: 3,
  list_add: 2,
  detail_open: 0.6,
  photo_browse: 0.25,
  unsave: -1.2,
};

/** Photo browsing on one product never adds up to more than this. */
export const PHOTO_BROWSE_CAP = 0.75;

/** Skips faster than this are decisive "no"s; slower than SLOW are hesitant. */
export const FAST_SKIP_MS = 900;
export const SLOW_SKIP_MS = 4000;
