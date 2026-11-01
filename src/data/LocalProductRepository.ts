import { matchesFilters } from '@/domain/filters';
import { computePriceBands, type PriceBands } from '@/recommendation';
import { CATEGORY_IDS, type Category, type CategoryId, type Product, type Retailer } from '@/domain/types';
import type { ProductQuery, ProductRepository, StyleOption } from './ProductRepository';

/** In-memory repository over a fixed catalog (the bundled sample data). */
export class LocalProductRepository implements ProductRepository {
  private readonly byId: Map<string, Product>;
  private readonly retailerNames: Map<string, string>;
  private readonly bands: PriceBands;
  private readonly searchText: Map<string, string>;

  constructor(
    private readonly products: readonly Product[],
    private readonly categories: readonly Category[],
    private readonly retailers: readonly Retailer[],
  ) {
    this.byId = new Map(products.map((p) => [p.id, p]));
    this.retailerNames = new Map(retailers.map((r) => [r.id, r.name]));
    this.bands = computePriceBands(products);
    this.searchText = new Map(
      products.map((p) => [
        p.id,
        [
          p.title,
          p.brand,
          this.retailerNames.get(p.retailerId) ?? '',
          p.material,
          p.color,
          p.categoryId,
          ...p.styleTags,
        ]
          .join(' ')
          .toLowerCase(),
      ]),
    );
  }

  async listCategories(): Promise<Category[]> {
    return [...this.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async countByCategory(): Promise<Record<CategoryId, number>> {
    const counts = Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0])) as Record<CategoryId, number>;
    for (const p of this.products) counts[p.categoryId]++;
    return counts;
  }

  async listProducts({ categoryId, search, excludeIds, filters, limit }: ProductQuery = {}): Promise<Product[]> {
    const terms = (search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const out: Product[] = [];
    for (const p of this.products) {
      if (categoryId && p.categoryId !== categoryId) continue;
      if (excludeIds?.has(p.id)) continue;
      if (filters && !matchesFilters(p, filters)) continue;
      if (terms.length > 0) {
        const text = this.searchText.get(p.id)!;
        if (!terms.every((t) => text.includes(t))) continue;
      }
      out.push(p);
      if (limit !== undefined && out.length >= limit) break;
    }
    return out;
  }

  async getProduct(id: string): Promise<Product | null> {
    return this.byId.get(id) ?? null;
  }

  async getProducts(ids: readonly string[]): Promise<Product[]> {
    return ids.map((id) => this.byId.get(id)).filter((p): p is Product => p !== undefined);
  }

  async listRetailers(): Promise<Retailer[]> {
    return [...this.retailers];
  }

  async getPriceBands(): Promise<PriceBands> {
    return this.bands;
  }

  async listStyles(): Promise<StyleOption[]> {
    const byTag = new Map<string, StyleOption>();
    for (const p of this.products) {
      p.styleTags.forEach((tag, i) => {
        const o = byTag.get(tag) ?? { tag, count: 0 };
        o.count++;
        // Prefer a product where this is the main style for the cover photo.
        if (!o.coverUrl && i === 0) o.coverUrl = p.imageUrls[0];
        byTag.set(tag, o);
      });
    }
    return [...byTag.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }
}
