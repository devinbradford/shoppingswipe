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
  PRODUCT_COLUMNS_WITH_META,
  productFromRow,
  retailerFromRow,
  subcategoryFromRow,
  type ProductRow,
} from '@/lib/rows';
import { CANDIDATE_POOL_SIZE, chunk, ID_CHUNK, isEligible, PAGE_SIZE, sampleIds } from '@/lib/candidatePool';
import { computePriceBands, type PriceBands } from '@/recommendation';
import type {
  CandidateBatch,
  CandidateQuery,
  ProductQuery,
  ProductRepository,
  StyleOption,
} from './ProductRepository';

type IndexRow = Pick<
  ProductRow,
  'id' | 'category_id' | 'subcategory_id' | 'retailer_id' | 'price_cents' | 'style_tags' | 'image_urls'
>;

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

  /** False once the database says it has no image_meta column (migration not run yet). */
  private photoMeta = true;

  constructor(private readonly db: SupabaseClient) {}

  /**
   * Runs a products query with the photo measurements, or without them on a database
   * that doesn't have that column yet, so the app keeps working either way.
   */
  private async products<T>(
    build: (columns: string) => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>,
  ): Promise<T | null> {
    const { data, error } = await build(this.photoMeta ? PRODUCT_COLUMNS_WITH_META : PRODUCT_COLUMNS);
    if (error?.code === '42703' && this.photoMeta) {
      this.photoMeta = false;
      return this.products(build);
    }
    if (error) throw new Error(error.message);
    return data;
  }

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

  /**
   * Every active product's id, room, type, store, price, styles and first photo: small rows,
   * read once and cached. Paged by id ("after the last id I got"), so a product that changes
   * mid-read can't shift a page and be skipped or read twice. Any failed page fails the whole
   * read (and it isn't cached), never a silently shorter catalog.
   */
  private index() {
    return this.cached('index', async () => {
      const rows: IndexRow[] = [];
      for (let after: string | null = null; ; ) {
        let q = this.db
          .from('products')
          .select('id, category_id, subcategory_id, retailer_id, price_cents, style_tags, image_urls')
          .eq('is_active', true);
        if (after !== null) q = q.gt('id', after);
        const { data, error } = await q.order('id').limit(PAGE_SIZE);
        if (error) throw new Error(error.message);
        const page = (data ?? []) as IndexRow[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
        after = page[page.length - 1]!.id;
      }
      return rows;
    });
  }

  /** Full rows for these ids, in small batches (short URLs, under the per-request row cap). */
  private async rowsByIds(ids: readonly string[], activeOnly: boolean): Promise<ProductRow[]> {
    const batches = await Promise.all(
      chunk([...new Set(ids)], ID_CHUNK).map((part) =>
        this.products((columns) => {
          let q = this.db.from('products').select(columns).in('id', part);
          if (activeOnly) q = q.eq('is_active', true);
          return q;
        }),
      ),
    );
    return batches.flatMap((rows) => (rows ?? []) as unknown as ProductRow[]);
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
    // Pages through matches by id until `want` unswiped ones are found or the matches run out,
    // so swiped products never use up the limit. A failed page fails the call (no partial list).
    const want = limit ?? PAGE_SIZE;
    const out: Product[] = [];
    for (let after: string | null = null; out.length < want; ) {
      const pageSize = Math.min(PAGE_SIZE, want - out.length + (excludeIds?.size ?? 0));
      const data = await this.products((columns) => {
        let q = this.db.from('products').select(columns).eq('is_active', true);
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
        if (after !== null) q = q.gt('id', after);
        // Leave out swiped items here rather than in the URL, so long swipe histories stay fast.
        return q.order('id').limit(pageSize);
      });
      const rows = (data ?? []) as unknown as ProductRow[];
      for (const r of rows) {
        const p = productFromRow(r);
        if (excludeIds?.has(p.id) || (filters && !matchesFilters(p, filters))) continue;
        out.push(p);
        if (out.length >= want) break;
      }
      if (rows.length < pageSize) break;
      after = rows[rows.length - 1]!.id;
    }
    return out;
  }

  async listCandidates({ size = CANDIDATE_POOL_SIZE, seed = 0, ...q }: CandidateQuery = {}): Promise<CandidateBatch> {
    const eligible = (await this.index())
      .filter((r) =>
        isEligible(
          {
            id: r.id,
            categoryId: r.category_id,
            subcategoryId: r.subcategory_id,
            retailerId: r.retailer_id,
            priceCents: r.price_cents,
          },
          q,
        ),
      )
      .map((r) => r.id);
    const picked = sampleIds(eligible, size, seed);
    // Re-checked by the database: anything switched off since the index was read is left out.
    const rows = await this.rowsByIds(picked, true);
    const byId = new Map(rows.map((r) => [r.id, productFromRow(r)]));
    const products = picked
      .map((id) => byId.get(id))
      .filter((p): p is Product => p !== undefined && (!q.filters || matchesFilters(p, q.filters)));
    return { products, eligible: eligible.length, complete: picked.length === eligible.length };
  }

  async getProduct(id: string): Promise<Product | null> {
    const data = await this.products((columns) => this.db.from('products').select(columns).eq('id', id).maybeSingle());
    return data ? productFromRow(data as unknown as ProductRow) : null;
  }

  async getProducts(ids: readonly string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    // In batches: one request for a long swipe history would be cut off at 1,000 rows.
    const byId = new Map((await this.rowsByIds(ids, false)).map((r) => [r.id, productFromRow(r)]));
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
