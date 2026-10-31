import { CATEGORIES, generateCatalog, RETAILERS } from './sample/catalog';
import { LocalProductRepository } from './LocalProductRepository';
import type { ProductRepository } from './ProductRepository';

export type { ProductQuery, ProductRepository } from './ProductRepository';

let instance: ProductRepository | null = null;

/**
 * The app-wide repository. Phase 3 swaps this for a SupabaseProductRepository
 * when the backend is configured; nothing else needs to change.
 */
export function getProductRepository(): ProductRepository {
  if (!instance) {
    instance = new LocalProductRepository(generateCatalog(), CATEGORIES, RETAILERS);
  }
  return instance;
}

/** Test hook: replace the repository. */
export function setProductRepository(repo: ProductRepository | null): void {
  instance = repo;
}
