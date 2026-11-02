import { CATEGORIES, generateCatalog, RETAILERS, SUBCATEGORIES } from './sample/catalog';
import { LocalProductRepository } from './LocalProductRepository';
import type { ProductRepository } from './ProductRepository';

export type { ProductQuery, ProductRepository, StyleOption } from './ProductRepository';

let instance: ProductRepository | null = null;

/**
 * The app-wide repository. Phase 3 swaps this for a SupabaseProductRepository
 * when the backend is configured; nothing else needs to change.
 */
export function getProductRepository(): ProductRepository {
  if (!instance) {
    instance = new LocalProductRepository(generateCatalog(), CATEGORIES, SUBCATEGORIES, RETAILERS);
  }
  return instance;
}

/** Test hook: replace the repository. */
export function setProductRepository(repo: ProductRepository | null): void {
  instance = repo;
}
