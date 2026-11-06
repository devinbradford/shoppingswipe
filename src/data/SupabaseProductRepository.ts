import type { SupabaseClient } from '@supabase/supabase-js';

import { matchesFilters } from '@/domain/filters';
import {
  SUBCATEGORY_IDS,
  type Category,
  type Product,
  type Retailer,
  type Subcategory,
  type SubcategoryId,
} from '@/domain/types';
import {
  categoryFromRow,
  PRODUCT_COLUMNS,
  productFromRow,
  retailerFromRow,
  subcategoryFromRow,
  type ProductRow,
} from '@/lib/rows';
import { computePriceBands, type PriceBands } from '@/recommendation';
import type { ProductQuery, ProductRepository, StyleOption } from './ProductRepository';

/** Strip characters that have meaning in PostgREST filter strings. */
function safeTerm(t: string): string {
  return t.replace(/[,()*%\\.:"']/g, ' ').trim();
}

/** Short-lived cache so Discover, the deck and filters don't refetch the same small tables. */
const TTL = 5 * 60_000;

/**
 * Reads the catalog from Supabase. Matches the local repository's behaviour so
 * screens don't change. Some totals are computed on the phone from a light
 * product index; at ~50k+ products those move into database functions.
 */
export class SupabaseProductRepository implements ProductRepository {
  private cache = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(private readonly db: SupabaseClient) {}

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.value as Promise<T>;
    const value = load().catch((e) => {
      this.cache.delete(key);
      throw e;
    });
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  /** Every active product's id, type, price, styles and first photo. */
  private index() {
    return this.cached('index', async () => {
      const rows: Pick<ProductRow, 'id' | 'subcategory_id' | 'price_cents' | 'style_tags' | 'image_urls'>[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await this.db
          .from('products')
          .select('id, subcategory_id, price_cents, style_tags, image_urls')
          .eq('is_active', true)
          .order('id')
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return rows;
    });
  }

  listCategories(): Promise<Category[]> {
    return this.cached('categories', async () => {
      const { data, error } = await this.db.from('categories').select('id, label, sort_order').order('sort_order');
      if (error) throw new Error(error.message);
      return (data ?? []).map(categoryFromRow);
    });
  }

  listSubcategories(): Promise<Subcategory[]> {
    return this.cached('subcategories', async () => {
      const { data, error } = await this.db
        .from('subcategories')
        .select('id, category_id, label, sort_order')
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data ?? []).map(subcategoryFromRow);
    });
  }

  async countBySubcategory(excludeIds?: ReadonlySet<string>): Promise<Record<SubcategoryId, number>> {
    const counts = Object.fromEntries(SUBCATEGORY_IDS.map((id) => [id, 0])) as Record<SubcategoryId, number>;
    for (const r of await this.index()) {
      if (excludeIds?.has(r.id)) continue;
      const id = r.subcategory_id as SubcategoryId;
      if (id in counts) counts[id]++;
    }
    return counts;
  }

  async listProducts({ categoryId, subcategoryId, search, excludeIds, filters, limit }: ProductQuery = {}): Promise<
    Product[]
  > {
    // Discontinued products (a feed stopped listing them) never appear in decks or search.
    // Saved ones still open by id (getProduct/getProducts), so Kept and lists don't lose them.
    let q = this.db.from('products').select(PRODUCT_COLUMNS).eq('is_active', true);
    if (categoryId) q = q.eq('category_id', categoryId);
    if (subcategoryId) q = q.eq('subcategory_id', subcategoryId);
    if (filters?.categoryIds.length) q = q.in('category_id', filters.categoryIds);
    if (filters?.subcategoryIds.length) q = q.in('subcategory_id', filters.subcategoryIds);
    if (filters?.retailerIds.length) q = q.in('retailer_id', filters.retailerIds);
    if (filters?.minPriceCents != null) q = q.gte('price_cents', filters.minPriceCents);
    if (filters?.maxPriceCents != null) q = q.lte('price_cents', filters.maxPriceCents);
    // Every word must match somewhere (title, brand, material or color).
    for (const raw of (search ?? '').split(/\s+/)) {
      const t = safeTerm(raw);
      if (!t) continue;
      q = q.or(
        `title.ilike.*${t}*,brand.ilike.*${t}*,material.ilike.*${t}*,color.ilike.*${t}*,style_tags.cs.{${t.toLowerCase()}}`,
      );
    }
    q = q.order('id');
    // Leave out swiped items here rather than in the URL, so long swipe histories stay fast.
    const want = limit ?? 1000;
    q = q.limit(excludeIds?.size ? Math.min(1000, want + excludeIds.size) : want);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as ProductRow[])
      .map(productFromRow)
      .filter((p) => !excludeIds?.has(p.id) && (!filters || matchesFilters(p, filters)))
      .slice(0, want);
  }

  async getProduct(id: string): Promise<Product | null> {
    const { data, error } = await this.db.from('products').select(PRODUCT_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? productFromRow(data as ProductRow) : null;
  }

  async getProducts(ids: readonly string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.db
      .from('products')
      .select(PRODUCT_COLUMNS)
      .in('id', [...ids]);
    if (error) throw new Error(error.message);
    const byId = new Map(((data ?? []) as ProductRow[]).map((r) => [r.id, productFromRow(r)]));
    return ids.map((id) => byId.get(id)).filter((p): p is Product => p !== undefined);
  }

  listRetailers(): Promise<Retailer[]> {
    return this.cached('retailers', async () => {
      const { data, error } = await this.db.from('retailers').select('id, name, domain').order('name');
      if (error) throw new Error(error.message);
      return (data ?? []).map(retailerFromRow);
    });
  }

  async getPriceBands(): Promise<PriceBands> {
    const rows = await this.index();
    return computePriceBands(
      rows.map((r) => ({ subcategoryId: r.subcategory_id as SubcategoryId, priceCents: r.price_cents })),
    );
  }

  async listStyles(): Promise<StyleOption[]> {
    const byTag = new Map<string, StyleOption>();
    for (const r of await this.index()) {
      (r.style_tags ?? []).forEach((tag, i) => {
        const o = byTag.get(tag) ?? { tag, count: 0 };
        o.count++;
        if (!o.coverUrl && i === 0) o.coverUrl = r.image_urls?.[0];
        byTag.set(tag, o);
      });
    }
    return [...byTag.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }
}
