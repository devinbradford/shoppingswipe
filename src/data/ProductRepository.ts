import type { PriceBands } from '@/recommendation';
import type { Category, CategoryId, Product, Retailer } from '@/domain/types';

export interface ProductQuery {
  categoryId?: CategoryId;
  /** Free text matched against title, brand, retailer, style, material and color. */
  search?: string;
  /** Product ids to leave out (e.g. already swiped). */
  excludeIds?: ReadonlySet<string>;
  limit?: number;
}

/**
 * The only way the app reads the catalog. Screens and hooks depend on this
 * interface, never on a concrete source, so the local sample catalog can be
 * swapped for Supabase (Phase 3) without touching the UI.
 */
export interface ProductRepository {
  listCategories(): Promise<Category[]>;
  /** Number of products in each category. */
  countByCategory(): Promise<Record<CategoryId, number>>;
  listProducts(query?: ProductQuery): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  /** Products for the given ids, in the same order; unknown ids are dropped. */
  getProducts(ids: readonly string[]): Promise<Product[]>;
  listRetailers(): Promise<Retailer[]>;
  /** Low/mid/high price boundaries per category, used by the recommender. */
  getPriceBands(): Promise<PriceBands>;
}
