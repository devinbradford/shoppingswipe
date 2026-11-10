/**
 * Product feed import: shared types.
 *
 * Pure TypeScript with relative imports only (like src/recommendation), so the same
 * code runs in Jest, in the local `npm run import-feed` script, and in the
 * `import-feeds` Supabase Edge Function.
 */
import type { CategoryId, SubcategoryId } from '../domain/types';

/** One row of a retailer's feed, normalised from the affiliate network's format. */
export interface FeedItem {
  /** The network's id for this exact item (one size / colour). */
  externalId: string;
  /** Items with the same group key are one product in different sizes. */
  groupKey: string;
  /** Name without the size, e.g. "Maui Braided Rug in Black". */
  title: string;
  /** "5' X 8' Oval", "Queen", or '' when there's no size. */
  sizeLabel: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrls: string[];
  /** The tracked affiliate link: what Buy now opens. */
  trackingUrl: string;
  /** The retailer's own product page (for health checks). */
  merchantUrl: string;
  inStock: boolean;
  brand: string;
  /** Everything the retailer says about its category, for sorting into our types. */
  categoryText: string;
  /** The feed's own colour field, when it has one. */
  colourField: string;
}

/** A product ready for the catalog (mirrors the `products` table). */
export interface ImportedProduct {
  id: string;
  externalId: string;
  categoryId: CategoryId;
  subcategoryId: SubcategoryId;
  retailerId: string;
  title: string;
  brand: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrls: string[];
  productUrl: string;
  styleTags: string[];
  material: string;
  color: string;
  /** Kept for the health check; not stored. */
  merchantUrl: string;
}

export type SkipReason =
  | 'not-our-category'
  | 'out-of-scope'
  | 'out-of-stock'
  | 'bad-price'
  | 'no-image'
  | 'no-link'
  | 'image-broken'
  | 'link-broken'
  | 'link-redirects-away'
  | 'not-checked-yet'
  | 'over-limit';

export interface ImportReport {
  /** Rows in the feed. */
  rows: number;
  /** Distinct products after grouping sizes. */
  products: number;
  imported: number;
  skipped: Partial<Record<SkipReason, number>>;
  byType: Partial<Record<SubcategoryId, number>>;
  /** A few examples per skip reason, so a person can see what went wrong. */
  examples: Partial<Record<SkipReason, string[]>>;
  /** Store pages visited in the health check; `stale` = most were broken, so the feed is out of date. */
  pageCheck?: { sampled: number; checked: number; broken: number; stale: boolean };
  /**
   * Photo measuring for the studio card. `skipped` says why nothing was measured
   * (e.g. the image_meta column isn't in the database yet).
   */
  photos?: {
    measured: number;
    reused: number;
    failed: number;
    cutouts: number;
    trimmed: number;
    notes: Record<string, number>;
    skipped?: string;
  };
}

/** Result of fetching a URL during health checks (injected, so the core stays pure). */
export interface ProbeResult {
  ok: boolean;
  status: number;
  /** Where the request ended up after redirects. */
  finalUrl: string;
  contentType: string;
  /** Bytes, when known. */
  size: number | null;
}

export type Probe = (url: string, kind: 'image' | 'page') => Promise<ProbeResult>;
