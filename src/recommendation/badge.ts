/**
 * The small pill above a product's name on the swipe card (Step 5, Option A). It only
 * says what the data can honestly back up:
 *
 *  - "Still learning your style" while the taste model is in its learning stage (the same
 *    stage the Your taste screen uses: under 10 swipes, under 3 keeps, no rooms).
 *  - "For you · oak, black": up to two of the product's own style / material / colour
 *    attributes, each of which
 *      1. lifted this card's score by at least the engine's own reason threshold
 *         (read-only: the same arithmetic as rank.ts; nothing about ranking changes),
 *      2. is a clear, well-supported like (the Your taste bar), not muted,
 *      3. is actually supported by the store's listing (name + description), checked
 *         strictly: finish names, "-look" / "faux" wording and negations don't count.
 *  - Nothing in every other case, including exploration cards. Brand, store and price
 *    are never named.
 *
 * Pure: no React, no I/O.
 */
import type { Product } from '../domain/types';
import { productFeatures, type FeatureKind, type PriceBands, type RankedProduct } from './engine';
import { affinity, type TasteModel } from './model';
import { RANK_OPTIONS } from './rank';
import { CLEAR_LIKE, tasteStage } from './summary';

export type CardBadge = { kind: 'learning' } | { kind: 'match'; labels: string[] } | null;

export const LEARNING_TEXT = 'Still learning your style';
/** Two labels are shown together only if they fit in this many characters ("oak, black" = 10). */
export const MAX_LABELS_CHARS = 22;
/** A single label longer than this isn't shown (it wouldn't stay readable on one line). */
export const MAX_LABEL_CHARS = 16;

type TasteKind = 'style' | 'material' | 'color';
const TASTE_KINDS: readonly TasteKind[] = ['style', 'material', 'color'];

// ---- Listing checks -------------------------------------------------------------------

/** Lower-case, accents removed ("bouclé" → "boucle"), hyphens and slashes as spaces. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ');
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Woods are usually a finish name in furniture listings, so they need an explicit cue. */
const WOODS = new Set([
  'oak',
  'walnut',
  'pine',
  'ash',
  'maple',
  'cherry',
  'acacia',
  'teak',
  'mango',
  'alder',
  'birch',
  'beech',
  'elm',
  'rubberwood',
  'bamboo',
  'eucalyptus',
  'mahogany',
]);
/** "solid oak", "real walnut", "made of pine", "made from solid oak". */
const WOOD_CUE_BEFORE =
  /(?:\bsolid|\breal|\bgenuine|\bmade (?:of|from)(?: solid)?|\bcrafted (?:of|from)(?: solid)?)\s+$/;
/** "oak wood", "walnut hardwood", "pine timber" (but not "oak wood grain / look / effect"). */
const WOOD_CUE_AFTER =
  /^\s+(?:wood|hardwood|timber|lumber)\b(?!\s+(?:grain|look|effect|finish|color|colour|tone|print|pattern|veneer|paper))/;
/** Words that make it an appearance, not the material: "oak-look", "oak effect", "oak finish". */
const LOOK_AFTER =
  /^\s*(?:look|looking|effect|style|finish|finished|grain|print|printed|pattern|patterned|colou?r|colou?red|tone|toned|laminate|veneer|paper|foil|vinyl|melamine|textured|inspired)\b/;
/** Words just before that mean it isn't the real thing: "faux leather", "PE rattan". */
const FAKE_BEFORE =
  /\b(?:faux|imitation|fake|synthetic|simulated|artificial|pe|pu|pvc|vegan|printed|printing|engineered|look ?alike)\s+$/;
/** A negation shortly before: "no rattan", "not real wood", "without velvet", "free of". */
const NEGATION_BEFORE = /\b(?:no|not|non|without|never|free of|instead of)\s+(?:\w+\s+){0,2}$/;
/** After a style word these make it a finish or colour name ("Coastal Oak", "Rustic Brown"). */
const FINISH_AFTER =
  /^\s+(?:oak|walnut|pine|ash|alder|cherry|maple|acacia|mango|teak|white|black|brown|grey|gray|natural|cream|beige|wood|finish)\b/;
/** A colour that only describes a small part ("black handles", "gold hardware"). */
const PART_AFTER = /^\s+(?:handles?|hardware|knobs?|pulls?|accents?|trims?|stitching|piping|buttons?|hinges?)\b/;

/**
 * True only if the store's own listing clearly says the product has this attribute.
 * Ambiguous wording (a finish name, an "-look", a negation, a part's colour) doesn't count,
 * so when in doubt the badge simply leaves the attribute out.
 */
export function listingSupports(
  product: Pick<Product, 'title' | 'description'>,
  label: string,
  kind: TasteKind,
): boolean {
  const text = fold(`${product.title ?? ''} . ${product.description ?? ''}`);
  const word = fold(label).trim();
  if (!word || !text.trim()) return false;
  const variants = [...new Set([word, word.replace(/ /g, '')])];
  for (const v of variants) {
    const re = new RegExp(`(^|[^a-z0-9])(${escape(v)})(?=[^a-z0-9]|$)`, 'g');
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const start = m.index + m[1].length;
      const before = text.slice(Math.max(0, start - 40), start);
      const after = text.slice(start + m[2].length, start + m[2].length + 40);
      if (NEGATION_BEFORE.test(before)) continue;
      if (kind === 'style') {
        if (FINISH_AFTER.test(after)) continue;
        return true;
      }
      if (kind === 'color') {
        if (PART_AFTER.test(after) || LOOK_AFTER.test(after)) continue;
        return true;
      }
      // Material.
      if (FAKE_BEFORE.test(before) || LOOK_AFTER.test(after)) continue;
      if (WOODS.has(word) && !WOOD_CUE_BEFORE.test(before) && !WOOD_CUE_AFTER.test(after)) continue;
      return true;
    }
  }
  return false;
}

// ---- Preference checks ----------------------------------------------------------------

/** A clear, well-supported like (the Your taste bar), or something they asked to see more of; never muted. */
export function isClearLike(model: TasteModel, key: string): boolean {
  if (model.muted.includes(key)) return false;
  if (model.boosted.includes(key)) return true;
  const a = affinity(model, key);
  const pos = model.long[key]?.pos ?? 0;
  const neg = model.long[key]?.neg ?? 0;
  return pos + neg >= CLEAR_LIKE.minEvidence && a.mean >= CLEAR_LIKE.lean && pos > CLEAR_LIKE.agree * neg;
}

// ---- The badge ------------------------------------------------------------------------

export function cardBadge(card: RankedProduct, model: TasteModel, bands: PriceBands): CardBadge {
  if (tasteStage(model) === 'learning') return { kind: 'learning' };
  // Exploration cards are there to learn, not because they match: no claim (MVP).
  if (card.explored) return null;

  const { featureWeights, reasonThreshold } = RANK_OPTIONS;
  const styleCount = Math.max(1, card.product.styleTags.length);
  const ranked = productFeatures(card.product, bands)
    .filter((f): f is typeof f & { kind: TasteKind } => (TASTE_KINDS as readonly string[]).includes(f.kind))
    .map((f) => {
      const weight = featureWeights[f.kind as FeatureKind] * (f.kind === 'style' ? 1 / styleCount : 1);
      return { f, lift: affinity(model, f.key).mean * weight };
    })
    .filter(
      ({ f, lift }) =>
        lift >= reasonThreshold &&
        f.label.length <= MAX_LABEL_CHARS &&
        isClearLike(model, f.key) &&
        listingSupports(card.product, f.label, f.kind),
    )
    .sort((a, b) => b.lift - a.lift);
  const labels = [...new Set(ranked.map(({ f }) => f.label.toLowerCase()))];
  if (labels.length === 0) return null;
  const two = labels.slice(0, 2);
  return { kind: 'match', labels: two.join(', ').length <= MAX_LABELS_CHARS ? two : two.slice(0, 1) };
}

/** What the pill says (without the "For you ·" lead-in for matches), or null for no pill. */
export function badgeLabel(badge: CardBadge): string | null {
  if (!badge) return null;
  return badge.kind === 'learning' ? LEARNING_TEXT : badge.labels.join(', ');
}

/** What a screen reader hears for the pill (same meaning as what's shown), or null. */
export function badgeSpoken(badge: CardBadge): string | null {
  if (!badge) return null;
  return badge.kind === 'learning' ? LEARNING_TEXT : `Picked for you: ${badge.labels.join(' and ')}`;
}
