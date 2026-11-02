import { CATEGORIES, generateCatalog, RETAILERS, SUBCATEGORIES } from './sample/catalog';
import { getSupabase } from '@/lib/supabase';
import { LocalProductRepository } from './LocalProductRepository';
import { SupabaseProductRepository } from './SupabaseProductRepository';
import type { ProductRepository } from './ProductRepository';

export type { ProductQuery, ProductRepository, StyleOption } from './ProductRepository';

let instance: ProductRepository | null = null;

/**
 * The app-wide repository: the Supabase catalog when the backend is configured
 * (a `.env` with the project URL and key), otherwise the built-in sample data.
 */
export function getProductRepository(): ProductRepository {
  if (!instance) {
    const db = getSupabase();
    instance = db
      ? new SupabaseProductRepository(db)
      : new LocalProductRepository(generateCatalog(), CATEGORIES, SUBCATEGORIES, RETAILERS);
  }
  return instance;
}

/** Test hook: replace the repository. */
export function setProductRepository(repo: ProductRepository | null): void {
  instance = repo;
}
