/**
 * Historical product facts (Discovery Engine V3, phase 1: learning-data integrity).
 *
 * The taste model learns from swipes and signals, but it reads each product's attributes from
 * the catalog. When a product goes inactive the catalog stops returning it, and everything the
 * shopper taught the engine with it used to drop out of their taste. These are the attributes
 * the engine reads, saved when the shopper reacted, so history keeps counting.
 *
 * Rules:
 * - The live catalog record always wins; saved facts only fill in products the catalog didn't
 *   return. With the same information, the model is exactly what V2 built.
 * - Facts hold only what the engine reads: no name, photo or purchase link.
 * - `featureVersion` says which attribute set a record carries, so later (V3) visual attributes
 *   can sit beside older records instead of being mixed with them.
 *
 * Pure, so it's unit-tested and can run in a server function unchanged.
 */
import type { CategoryId, Product, SubcategoryId } from '@/domain/types';

/** v1: the text attributes V2 uses (styles, material, colour, brand, store, type, price). */
export const FEATURE_VERSION = 1;

export interface ProductFacts {
  id: string;
  categoryId: CategoryId;
  subcategoryId: SubcategoryId;
  retailerId: string;
  brand: string;
  styleTags: string[];
  material: string;
  color: string;
  priceCents: number;
  currency: string;
  featureVersion: number;
  /** When these facts were last read from the catalog. */
  capturedAt: number;
  /** When a clean-up pass first found nothing pointing at this record (see `sweepSnapshots`). */
  orphanedAt?: number;
}

export type FactsMap = Readonly<Record<string, ProductFacts>>;

export function factsOf(product: Product, now: number): ProductFacts {
  return {
    id: product.id,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    retailerId: product.retailerId,
    brand: product.brand,
    styleTags: [...product.styleTags],
    material: product.material,
    color: product.color,
    priceCents: product.priceCents,
    currency: product.currency,
    featureVersion: FEATURE_VERSION,
    capturedAt: now,
  };
}

/** Whether the catalog's record differs from the saved one in anything the engine reads. */
export function factsChanged(saved: ProductFacts | undefined, product: Product): boolean {
  if (!saved) return true;
  return (
    saved.orphanedAt !== undefined ||
    saved.featureVersion !== FEATURE_VERSION ||
    saved.categoryId !== product.categoryId ||
    saved.subcategoryId !== product.subcategoryId ||
    saved.retailerId !== product.retailerId ||
    saved.brand !== product.brand ||
    saved.material !== product.material ||
    saved.color !== product.color ||
    saved.priceCents !== product.priceCents ||
    saved.currency !== product.currency ||
    saved.styleTags.length !== product.styleTags.length ||
    saved.styleTags.some((t, i) => t !== product.styleTags[i])
  );
}

/**
 * A stand-in product built from saved facts, for the taste model only (never shown, never a
 * deck candidate): no title, photos or link.
 */
export function productFromFacts(f: ProductFacts): Product {
  return {
    id: f.id,
    categoryId: f.categoryId,
    subcategoryId: f.subcategoryId,
    retailerId: f.retailerId,
    title: '',
    brand: f.brand,
    description: '',
    priceCents: f.priceCents,
    currency: f.currency,
    imageUrls: [],
    productUrl: '',
    styleTags: [...f.styleTags],
    material: f.material,
    color: f.color,
    createdAt: new Date(f.capturedAt).toISOString(),
  };
}

/**
 * The products the taste model should read: every live record, plus saved facts for the
 * `needed` ids the catalog didn't return. Live records are never replaced.
 */
export function withHistoricalFacts(
  live: ReadonlyMap<string, Product>,
  facts: FactsMap,
  needed: Iterable<string>,
): Map<string, Product> {
  const out = new Map(live);
  for (const id of needed) {
    if (out.has(id)) continue;
    const f = facts[id];
    if (f) out.set(id, productFromFacts(f));
  }
  return out;
}
