/**
 * Engine Lab shoppers. Each one has a hidden taste defined on the catalog's ground truth (the
 * visual space and hidden quality), never on V2's tags. What they say during onboarding (style
 * picks) and their budget are separate and may be wrong, like real people.
 *
 * utility(product) = 3 · best match to any active taste prototype (Gaussian kernel in the visual
 * space, optionally only on some dimensions) + 0.25 · hidden quality + fixed per-product noise,
 * minus a large penalty above a strict budget.
 *
 * A shopper "keeps" with probability sigmoid(4 · (u − τ)), τ = their 80th-percentile utility over
 * what's eligible, so ~20–25% of random cards are kept. "Loves" = their top 2% of eligible
 * products: the highly satisfying finds the metrics look for. Synthetic: none of this is a
 * measured human behaviour.
 */
import type { Product, SubcategoryId } from '../../domain/types';
import { createRng, hashSeed, type Rng } from '../random';
import { FAMILIES, VISUAL_DIMS, type LabCatalog } from './catalog';

export interface Prototype {
  center: number[];
  weight: number;
  /** 1 = this dimension matters, 0 = indifferent. Default all 1. */
  mask?: number[];
  /** Only for these product types (category-specific taste). */
  types?: SubcategoryId[];
  /** Active from this swipe index (inclusive) until `until` (exclusive). */
  from?: number;
  until?: number;
}

export interface Phase {
  /** The deck the shopper is browsing (a product type, like the app's room deck). */
  subcategoryId: SubcategoryId;
  swipes: number;
}

export interface LabShopper {
  id: string;
  prototypes: Prototype[];
  /** Kernel width in the visual space. */
  sigma: number;
  /** Onboarding style picks (V2 `seedStyles`). Empty = skipped onboarding. */
  statedStyles: string[];
  /** A real budget. `strict` = anything above is unacceptable to them. */
  budget: { subcategoryId: SubcategoryId; maxCents: number; strict: boolean } | null;
  phases: Phase[];
  /** Ground-truth families they love (for reporting), e.g. ['mid-century']. */
  lovedFamilies: string[];
  seed: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function activePrototypes(s: LabShopper, swipeIndex: number, type: SubcategoryId): Prototype[] {
  return s.prototypes.filter(
    (p) =>
      (p.from === undefined || swipeIndex >= p.from) &&
      (p.until === undefined || swipeIndex < p.until) &&
      (!p.types || p.types.includes(type)),
  );
}

/** Fixed per shopper × product: taste isn't only design. */
function noiseFor(s: LabShopper, productId: string): number {
  const r = createRng(hashSeed(`${s.seed}:noise:${productId}`));
  return (r() + r() + r() - 1.5) * 0.5;
}

export function utility(s: LabShopper, product: Product, catalog: LabCatalog, swipeIndex: number): number {
  const t = catalog.truth.get(product.id)!;
  let best = 0;
  for (const proto of activePrototypes(s, swipeIndex, product.subcategoryId)) {
    let d2 = 0;
    for (let i = 0; i < VISUAL_DIMS.length; i++) {
      const m = proto.mask ? proto.mask[i]! : 1;
      d2 += m * (t.latent[i]! - proto.center[i]!) ** 2;
    }
    best = Math.max(best, proto.weight * Math.exp(-d2 / (2 * s.sigma * s.sigma)));
  }
  let u = 3 * best + 0.25 * t.quality + noiseFor(s, product.id);
  if (s.budget?.strict && product.subcategoryId === s.budget.subcategoryId && product.priceCents > s.budget.maxCents) u -= 3;
  return u;
}

/** Keep decision with the shopper's own randomness. */
export function keeps(rng: Rng, u: number, tau: number): boolean {
  return rng() < sigmoid(4 * (u - tau));
}

const center = (familyId: string) => FAMILIES.find((f) => f.id === familyId)!.center;
const jitter = (rng: Rng, c: number[], sd: number) => c.map((x) => x + sd * (rng() * 2 - 1));
const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]!) ** 2, 0));
const MAINSTREAM = FAMILIES.filter((f) => !f.untaggable).map((f) => f.id);

/** Two mainstream families that look clearly different (for two-taste and switch scenarios). */
function farPair(rng: Rng): [string, string] {
  for (;;) {
    const a = MAINSTREAM[Math.floor(rng() * MAINSTREAM.length)]!;
    const b = MAINSTREAM[Math.floor(rng() * MAINSTREAM.length)]!;
    if (a !== b && dist(center(a), center(b)) > 1.6) return [a, b];
  }
}
const styleOf = (familyId: string) => FAMILIES.find((f) => f.id === familyId)!.styleTag;

export type ShopperKind =
  | 'cold'
  | 'knows-style'
  | 'two-tastes'
  | 'category-split'
  | 'taste-shift'
  | 'visual-only'
  | 'hidden-gem'
  | 'strict-budget'
  | 'wrong-onboarding';

const NIGHTSTANDS: Phase[] = [{ subcategoryId: 'nightstands', swipes: 60 }];

/** Deterministic shopper `index` of a kind, for a catalog. */
export function makeShopper(kind: ShopperKind, index: number, catalog: LabCatalog): LabShopper {
  const seed = hashSeed(`lab-shopper:${kind}:${index}:${catalog.config.seed}`);
  const rng = createRng(seed);
  const base = { id: `${kind}-${index}`, sigma: 0.55, statedStyles: [] as string[], budget: null, phases: NIGHTSTANDS, seed };
  const one = (fam: string): Prototype => ({ center: jitter(rng, center(fam), 0.25), weight: 1 });
  const fam = MAINSTREAM[Math.floor(rng() * MAINSTREAM.length)]!;

  switch (kind) {
    case 'cold':
      return { ...base, prototypes: [one(fam)], lovedFamilies: [fam] };
    case 'knows-style':
      return { ...base, prototypes: [one(fam)], statedStyles: [styleOf(fam)], lovedFamilies: [fam] };
    case 'wrong-onboarding': {
      // They pick a style they actually dislike (unsure, or picking what they think they should like).
      const wrong = MAINSTREAM.filter((f) => dist(center(f), center(fam)) > 1.6);
      const w = wrong[Math.floor(rng() * wrong.length)] ?? farPair(rng)[1];
      return { ...base, prototypes: [one(fam)], statedStyles: [styleOf(w)], lovedFamilies: [fam] };
    }
    case 'two-tastes': {
      const [a, b] = farPair(rng);
      return { ...base, prototypes: [one(a), { ...one(b), weight: 0.95 }], lovedFamilies: [a, b] };
    }
    case 'category-split': {
      const [a, b] = farPair(rng);
      return {
        ...base,
        prototypes: [
          { ...one(a), types: ['nightstands'] },
          { ...one(b), types: ['sofas'] },
        ],
        phases: [
          { subcategoryId: 'nightstands', swipes: 30 },
          { subcategoryId: 'sofas', swipes: 30 },
        ],
        lovedFamilies: [a, b],
      };
    }
    case 'taste-shift': {
      const [a, b] = farPair(rng);
      return { ...base, prototypes: [{ ...one(a), until: 30 }, { ...one(b), from: 30 }], lovedFamilies: [a, b] };
    }
    case 'visual-only': {
      // Cares about silhouette, visual weight and finish only: no tag describes these.
      const c = [0, (rng() * 2 - 1) * 0.9, (rng() * 2 - 1) * 0.9, 0, 0, (rng() * 2 - 1) * 0.9];
      return { ...base, prototypes: [{ center: c, weight: 1, mask: [0, 1, 1, 0, 0, 1] }], sigma: 0.45, lovedFamilies: [] };
    }
    case 'hidden-gem':
      // Loves a long-tail design V2 has no word for, sold mostly by one small store.
      return { ...base, prototypes: [one('sculptural')], lovedFamilies: ['sculptural'] };
    case 'strict-budget': {
      const prices = catalog.products
        .filter((p) => p.subcategoryId === 'nightstands')
        .map((p) => p.priceCents)
        .sort((a, b) => a - b);
      const maxCents = prices[Math.floor(prices.length * 0.3)] ?? 20000;
      return { ...base, prototypes: [one(fam)], budget: { subcategoryId: 'nightstands', maxCents, strict: true }, lovedFamilies: [fam] };
    }
  }
}
