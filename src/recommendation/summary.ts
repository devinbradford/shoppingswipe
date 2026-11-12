/**
 * "Your taste": turns the taste model into plain-language traits for the shopper
 * to read and adjust. Pure: no React, no I/O.
 *
 * Only names a trait when the model leans clearly one way AND the raw evidence agrees
 * strongly (at least twice as many loved as skipped pieces had it, or the other way
 * round). Tuned on simulated shoppers with known tastes: named likes were right 90–99%
 * of the time, dislikes about 85%. Better to say less than to say something wrong.
 * Traits the shopper set themselves ("more", "less") always show.
 */
import type { PriceBands } from './engine';
import { affinity, type TasteModel } from './model';

export type TraitKind = 'style' | 'material' | 'color';

export interface Trait {
  /** Taste-model key, e.g. `material:walnut`. */
  key: string;
  kind: TraitKind;
  label: string;
  /** What they told us about it, if anything. */
  adjusted: 'more' | 'less' | null;
  /** Strength of the lean (log-odds), for ordering. */
  strength: number;
}

export type TasteStage = 'learning' | 'shaping' | 'confident';

export interface TasteSummary {
  stage: TasteStage;
  /** "Mid-century, walnut and olive", or null while still learning. */
  headline: string | null;
  styles: Trait[];
  materials: Trait[];
  colors: Trait[];
  /** "Less your thing": confident dislikes and anything they asked to see less of. */
  dislikes: Trait[];
  swipeCount: number;
  positiveCount: number;
}

/** Learned effect (log-odds) needed to call something a like or a dislike. */
const LIKE = 0.5;
const DISLIKE = -0.5;
/** Loved-to-skipped evidence ratio needed (and the reverse for dislikes). */
const AGREE = 2;
/** Weighted actions that must involve a feature before we name it. */
const MIN_EVIDENCE = 1;

/** The bar for calling something a clear like, shared with the swipe card's "For you" pill. */
export const CLEAR_LIKE = { lean: LIKE, agree: AGREE, minEvidence: MIN_EVIDENCE } as const;

const LIMITS: Record<TraitKind, number> = { style: 4, material: 5, color: 5 };

export function tasteStage(model: TasteModel): TasteStage {
  if (model.swipeCount < 10 && model.positiveCount < 3 && !model.seeded) return 'learning';
  if (model.swipeCount < 30) return 'shaping';
  return 'confident';
}

function kindOf(key: string): TraitKind | null {
  const kind = key.slice(0, key.indexOf(':'));
  return kind === 'style' || kind === 'material' || kind === 'color' ? kind : null;
}

export function tasteSummary(model: TasteModel): TasteSummary {
  const stage = tasteStage(model);
  const keys = new Set([...Object.keys(model.weights), ...Object.keys(model.long), ...model.muted, ...model.boosted]);
  const likes: Trait[] = [];
  const dislikes: Trait[] = [];
  for (const key of keys) {
    const kind = kindOf(key);
    if (!kind) continue;
    const label = model.labels[key] ?? key.slice(key.indexOf(':') + 1);
    const a = affinity(model, key);
    const ev = model.long[key];
    const pos = ev?.pos ?? 0;
    const neg = ev?.neg ?? 0;
    const evidence = pos + neg;
    const adjusted = model.boosted.includes(key) ? 'more' : model.muted.includes(key) ? 'less' : null;
    const trait: Trait = { key, kind, label, adjusted, strength: a.mean };
    const enough = adjusted === null && evidence >= MIN_EVIDENCE;
    if (adjusted === 'more' || (enough && a.mean >= LIKE && pos > AGREE * neg)) {
      likes.push(trait);
    } else if (adjusted === 'less' || (enough && a.mean <= DISLIKE && neg > AGREE * pos)) {
      dislikes.push(trait);
    }
  }
  const byStrength = (a: Trait, b: Trait) => b.strength - a.strength || a.label.localeCompare(b.label);
  likes.sort(byStrength);
  dislikes.sort((a, b) => a.strength - b.strength || a.label.localeCompare(b.label));
  const pick = (kind: TraitKind) => likes.filter((t) => t.kind === kind).slice(0, LIMITS[kind]);
  const styles = pick('style');
  const materials = pick('material');
  const colors = pick('color');

  return {
    stage,
    headline: stage === 'learning' ? null : headlineOf(styles, materials, colors),
    styles,
    materials,
    colors,
    dislikes: dislikes.slice(0, 6),
    swipeCount: model.swipeCount,
    positiveCount: model.positiveCount,
  };
}

/** "Mid-century, walnut and olive": their strongest style, material and colour. */
function headlineOf(styles: Trait[], materials: Trait[], colors: Trait[]): string | null {
  const words = [styles[0], materials[0], colors[0]].filter(Boolean).map((t) => t!.label);
  if (words.length === 0) return null;
  const text = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Their usual price and soft ceiling for one product type, in cents, from the learned
 * budget (which is relative to each type's typical price). Null until there's a budget.
 */
export function priceBandFor(
  model: TasteModel,
  bands: PriceBands,
  subcategoryId: keyof PriceBands,
): { usualCents: number; ceilingCents: number } | null {
  const b = bands[subcategoryId];
  if (!model.budget || !b || b[0] <= 0 || b[1] <= 0) return null;
  const typical = Math.sqrt(b[0] * b[1]);
  const round = (cents: number) => Math.round(cents / 5000) * 5000;
  return {
    usualCents: round(typical * Math.exp(model.budget.center)),
    ceilingCents: round(typical * Math.exp(model.budget.ceiling)),
  };
}
