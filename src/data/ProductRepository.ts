import type { PriceBands } from '@/recommendation';
import type { SearchFilters } from '@/domain/filters';
import type { Category, CategoryId, Product, Retailer, Subcategory, SubcategoryId } from '@/domain/types';

/** A style tag with how many products have it and a photo to represent it. */
export interface StyleOption {
  tag: string;
  count: number;
  coverUrl?: string;
}

export interface ProductQuery {
  categoryId?: CategoryId;
  subcategoryId?: SubcategoryId;
  /** Free text matched against title, brand, retailer, style, material and color. */
  search?: string;
  /** Product ids to leave out (e.g. already swiped). */
  excludeIds?: ReadonlySet<string>;
  /** Category, retailer and price filters from search. */
  filters?: SearchFilters;
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
  listSubcategories(): Promise<Subcategory[]>;
  /** Number of products of each type, leaving out `excludeIds` (e.g. already swiped). */
  countBySubcategory(excludeIds?: ReadonlySet<string>): Promise<Record<SubcategoryId, number>>;
  listProducts(query?: ProductQuery): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  /** Products for the given ids, in the same order; unknown ids are dropped. */
  getProducts(ids: readonly string[]): Promise<Product[]>;
  listRetailers(): Promise<Retailer[]>;
  /** Low/mid/high price boundaries per category, used by the recommender. */
  getPriceBands(): Promise<PriceBands>;
  /** Style tags across the catalog, most common first (for the taste picker). */
  listStyles(): Promise<StyleOption[]>;
}
