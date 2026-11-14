/**
 * Attribute labelling with the reduced workload (Stage 2): each product's attributes are
 * described by TWO independent raters; a field they disagree on goes to a THIRD rater, and if
 * the three still don't produce a majority it is labelled "uncertain" (never forced). Pure.
 */
import { createRng, hashSeed } from '@/recommendation/random';
import type { AttributeAnswer } from './schema';

export const ATTRIBUTE_FIELDS = ['silhouette', 'visualWeight', 'base', 'finish', 'woodTone', 'texture', 'ornament', 'photoKind', 'wholeVisible'] as const;
export type AttributeField = (typeof ATTRIBUTE_FIELDS)[number];

export type FieldOutcome =
  | { status: 'agreed'; value: string | number; votes: number }
  /** The first two raters disagree (or one said "not sure"): ask a third rater. */
  | { status: 'needs-third' }
  /** After three raters there is still no majority, or most said "not sure". */
  | { status: 'uncertain' };

/**
 * Aggregates one product's attribute answers (2 or 3 raters, in the order collected).
 * A field is agreed when at least 2 raters gave the same value; "not sure" (missing) never counts
 * as agreement.
 */
export function aggregateAttributes(answers: readonly AttributeAnswer[]): Record<AttributeField, FieldOutcome> {
  const out = {} as Record<AttributeField, FieldOutcome>;
  for (const f of ATTRIBUTE_FIELDS) {
    const counts = new Map<string | number, number>();
    for (const a of answers) {
      const v = a[f];
      if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const [best, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
    if (best !== undefined && n >= 2) out[f] = { status: 'agreed', value: best, votes: n };
    else out[f] = answers.length >= 3 ? { status: 'uncertain' } : { status: 'needs-third' };
  }
  return out;
}

/** Products whose attributes need a third rater (any field undecided after two). */
export function needsThirdRater(byProduct: ReadonlyMap<string, readonly AttributeAnswer[]>): string[] {
  return [...byProduct]
    .filter(([, a]) => a.length === 2 && Object.values(aggregateAttributes(a)).some((o) => o.status === 'needs-third'))
    .map(([id]) => id)
    .sort();
}

/**
 * Assigns every product to `perProduct` different raters, spreading the load evenly (each rater
 * gets within one product of the others) in a seeded order. With 3 raters and 2 per product each
 * rater describes about two-thirds of the products.
 */
export function assignAttributeRaters(productIds: readonly string[], raters: readonly string[], perProduct = 2, seed = 1): Map<string, string[]> {
  if (perProduct > raters.length) throw new Error(`need at least ${perProduct} raters`);
  const rng = createRng(hashSeed(`attr-assign:${seed}`));
  const order = [...productIds].sort().map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.id);
  const load = new Map(raters.map((r) => [r, 0]));
  const out = new Map<string, string[]>();
  for (const id of order) {
    const chosen = [...raters].sort((a, b) => load.get(a)! - load.get(b)! || (a < b ? -1 : 1)).slice(0, perProduct);
    for (const r of chosen) load.set(r, load.get(r)! + 1);
    out.set(id, chosen.sort());
  }
  return out;
}
