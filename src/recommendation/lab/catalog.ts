/**
 * Engine Lab catalogs: deterministic synthetic furniture with a hidden "truth" the engine never
 * sees. Every product has visible fields (the real `Product` shape: styles, material, colour,
 * brand, store, price, type) AND a ground truth: its design family, a position in a 6-dimension
 * visual space, a design id shared by near-duplicate variants, and a hidden quality.
 *
 * Shoppers' tastes are defined on the truth (see shoppers.ts), not on the tags, so the lab does
 * not automatically favour V2's own feature representation. Tags are derived from the truth with
 * realistic noise: a second tag, missing/defaulted labels ("modern", as the importer does when no
 * style word is found), wrong materials and colours, and two design families V2's vocabulary has
 * no word for at all. Three visual dimensions (curvature, mass, sheen) have no tag of any kind.
 *
 * Fictional data only (fictional stores, *.example.com links). Pure and seeded: the same config
 * always gives the same catalog.
 */
import type { CategoryId, Product, SubcategoryId } from '../../domain/types';
import { createRng, hashSeed, pick, type Rng } from '../random';

/** The hidden visual space. Only some dimensions leak into tags (via style, material, colour). */
export const VISUAL_DIMS = ['warmth', 'curvature', 'mass', 'ornament', 'texture', 'sheen'] as const;
/** Dimensions no tag describes at all (silhouette, visual weight, finish). */
export const UNTAGGED_DIMS = ['curvature', 'mass', 'sheen'] as const;

export interface Family {
  id: string;
  /** The style word a correct listing would carry (V2's vocabulary), or 'modern' when V2 has none. */
  styleTag: string;
  materials: string[];
  colors: string[];
  center: number[];
  /** Relative frequency in a catalog. */
  share: number;
  /** Price multiplier vs the type's typical price. */
  priceLevel: number;
  /** True when V2's style vocabulary has no word for it (listings fall back to 'modern'). */
  untaggable?: boolean;
}

//                                                    warmth curv  mass  orn   text  sheen
export const FAMILIES: Family[] = [
  { id: 'scandinavian', styleTag: 'scandinavian', materials: ['oak', 'linen'], colors: ['white', 'oatmeal'], center: [0.3, 0.1, -0.6, -0.8, -0.3, -0.5], share: 10, priceLevel: 1 },
  { id: 'mid-century', styleTag: 'mid-century', materials: ['walnut', 'teak'], colors: ['walnut', 'olive'], center: [0.7, 0.3, -0.5, -0.2, -0.4, 0.1], share: 10, priceLevel: 1.15 },
  { id: 'industrial', styleTag: 'industrial', materials: ['steel', 'pine'], colors: ['black', 'charcoal'], center: [-0.3, -0.8, 0.3, -0.3, 0.2, 0.2], share: 9, priceLevel: 0.85 },
  { id: 'bohemian', styleTag: 'bohemian', materials: ['rattan', 'jute'], colors: ['terracotta', 'rust'], center: [0.6, 0.4, -0.1, 0.6, 0.9, -0.6], share: 7, priceLevel: 0.9 },
  { id: 'coastal', styleTag: 'coastal', materials: ['rattan', 'linen'], colors: ['white', 'sage'], center: [0.1, 0.2, -0.3, -0.2, 0.5, -0.6], share: 7, priceLevel: 0.95 },
  { id: 'classic', styleTag: 'classic', materials: ['walnut', 'velvet'], colors: ['navy', 'cream'], center: [0.3, 0.5, 0.6, 0.8, 0.0, 0.4], share: 8, priceLevel: 1.3 },
  { id: 'farmhouse', styleTag: 'farmhouse', materials: ['pine', 'oak'], colors: ['cream', 'walnut'], center: [0.6, -0.3, 0.6, 0.1, 0.6, -0.7], share: 8, priceLevel: 0.9 },
  { id: 'glam', styleTag: 'maximalist', materials: ['velvet', 'lacquer'], colors: ['blush', 'navy'], center: [-0.1, 0.6, 0.2, 0.8, -0.2, 0.9], share: 6, priceLevel: 1.25 },
  { id: 'minimal', styleTag: 'minimal', materials: ['lacquer', 'steel'], colors: ['black', 'white'], center: [-0.5, -0.4, -0.3, -0.8, -0.7, 0.6], share: 9, priceLevel: 1 },
  { id: 'vintage', styleTag: 'vintage', materials: ['walnut', 'cane'], colors: ['olive', 'rust'], center: [0.5, 0.2, 0.1, 0.4, 0.3, -0.1], share: 6, priceLevel: 1 },
  { id: 'rustic', styleTag: 'rustic', materials: ['pine', 'jute'], colors: ['walnut', 'charcoal'], center: [0.5, -0.5, 0.8, 0.0, 0.8, -0.8], share: 6, priceLevel: 0.85 },
  { id: 'contemporary', styleTag: 'modern', materials: ['oak', 'boucle'], colors: ['oatmeal', 'charcoal'], center: [0.0, 0.0, 0.0, -0.3, 0.0, 0.0], share: 9, priceLevel: 1 },
  // Long-tail designs V2 has no word for: listings say "modern", like the importer's default.
  { id: 'sculptural', styleTag: 'modern', materials: ['travertine', 'boucle'], colors: ['cream', 'oatmeal'], center: [0.2, 0.95, 0.4, 0.2, 0.3, -0.3], share: 2, priceLevel: 1.2, untaggable: true },
  { id: 'japandi', styleTag: 'modern', materials: ['oak', 'cane'], colors: ['oatmeal', 'charcoal'], center: [0.4, -0.2, -0.4, -0.7, 0.4, -0.6], share: 3, priceLevel: 1.05, untaggable: true },
];

const ALL_MATERIALS = [...new Set(FAMILIES.flatMap((f) => f.materials))].sort();
const ALL_COLORS = [...new Set(FAMILIES.flatMap((f) => f.colors))].sort();
const ALL_STYLES = [...new Set(FAMILIES.map((f) => f.styleTag))].sort();

/** Product types, the room they belong to, typical price range (dollars) and catalog share. */
export const LAB_TYPES: { id: SubcategoryId; categoryId: CategoryId; price: [number, number]; share: number }[] = [
  { id: 'nightstands', categoryId: 'bedroom', price: [79, 699], share: 30 },
  { id: 'sofas', categoryId: 'living-room', price: [499, 3499], share: 15 },
  { id: 'dressers', categoryId: 'bedroom', price: [199, 1999], share: 8 },
  { id: 'bed-frames', categoryId: 'bedroom', price: [249, 1899], share: 7 },
  { id: 'accent-chairs', categoryId: 'living-room', price: [149, 1499], share: 7 },
  { id: 'coffee-tables', categoryId: 'living-room', price: [99, 1299], share: 7 },
  { id: 'tv-stands', categoryId: 'living-room', price: [149, 1299], share: 5 },
  { id: 'rugs', categoryId: 'living-room', price: [59, 1499], share: 5 },
  { id: 'bar-stools', categoryId: 'kitchen-dining', price: [59, 499], share: 5 },
  { id: 'dining-tables', categoryId: 'kitchen-dining', price: [299, 2999], share: 6 },
  { id: 'dining-chairs', categoryId: 'kitchen-dining', price: [79, 699], share: 5 },
];

export const LAB_RETAILERS = ['lab-r1', 'lab-r2', 'lab-r3', 'lab-r4', 'lab-r5', 'lab-r6', 'lab-r7', 'lab-r8'] as const;

export interface CatalogConfig {
  size: number;
  seed: number;
  /** Share of listings with a wrong or missing style / material / colour (0..1). Default 0.12. */
  labelNoise?: number;
  /** Near-duplicate variants per design (1 = none). Default 1. */
  variantsPerDesign?: number;
  /** 'balanced' (default) or 'dominant' (one store lists ~70% of the catalog). */
  retailerMix?: 'balanced' | 'dominant';
  /** Share of products switched off (inactive). Default 0.03. */
  inactiveShare?: number;
}

export interface Truth {
  family: string;
  /** Position in VISUAL_DIMS space. */
  latent: number[];
  /** Variants of one design share this. */
  designId: string;
  /** Hidden craft/quality, mean 0. */
  quality: number;
  active: boolean;
}

export interface LabCatalog {
  config: Required<CatalogConfig>;
  products: Product[];
  truth: Map<string, Truth>;
  /** Share of the catalog per retailer and per family (for long-tail definitions). */
  retailerShare: Map<string, number>;
  familyShare: Map<string, number>;
}

function gaussian(rng: Rng): number {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function weighted<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rng() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1]!;
}

function retailerFor(rng: Rng, family: Family, mix: 'balanced' | 'dominant'): string {
  // Long-tail designs mostly come from one small, specialist store.
  if (family.id === 'sculptural' && rng() < 0.8) return 'lab-r8';
  if (mix === 'dominant') return rng() < 0.7 ? 'lab-r1' : pick(rng, LAB_RETAILERS.slice(1));
  return weighted(rng, LAB_RETAILERS.slice(0, 7), (r) => (r === 'lab-r1' ? 1.4 : 1));
}

function priceCents(rng: Rng, [min, max]: [number, number], level: number, quality: number): number {
  const t = Math.pow(rng(), 1.5);
  const dollars = (min + t * (max - min)) * level * Math.exp(0.1 * quality);
  const step = dollars > 500 ? 50 : dollars > 100 ? 10 : 1;
  return Math.max(min, Math.round(dollars / step) * step - (step === 1 ? 0 : 1)) * 100;
}

export function buildLabCatalog(input: CatalogConfig): LabCatalog {
  const config: Required<CatalogConfig> = {
    labelNoise: 0.12,
    variantsPerDesign: 1,
    retailerMix: 'balanced',
    inactiveShare: 0.03,
    ...input,
  };
  const rng = createRng(hashSeed(`lab-catalog:${JSON.stringify(config)}`));
  const products: Product[] = [];
  const truth = new Map<string, Truth>();
  let n = 0;
  let design = 0;

  while (products.length < config.size) {
    const type = weighted(rng, LAB_TYPES, (t) => t.share);
    const family = weighted(rng, FAMILIES, (f) => f.share);
    const latent = family.center.map((c) => Math.max(-1.6, Math.min(1.6, c + 0.32 * gaussian(rng))));
    const quality = 0.5 * gaussian(rng);
    const designId = `d${design++}`;
    const variants = Math.min(config.variantsPerDesign, config.size - products.length);
    const baseRetailer = retailerFor(rng, family, config.retailerMix);
    const basePrice = priceCents(rng, type.price, family.priceLevel, quality);
    const brand = `${baseRetailer.replace('lab-', 'Brand ')}-${1 + Math.floor(rng() * 3)}`;

    // What a correct listing would say, then the listing as the store wrote it.
    const trueMaterial = pick(rng, family.materials);
    const styleTags = [family.styleTag];
    if (rng() < 0.3) styleTags.push(pick(rng, ALL_STYLES.filter((s) => s !== family.styleTag)));

    for (let v = 0; v < variants; v++) {
      const id = `lab-${config.seed}-${String(n++).padStart(5, '0')}`;
      const noisy = rng() < config.labelNoise;
      const tags = noisy ? (rng() < 0.6 ? ['modern'] : [pick(rng, ALL_STYLES)]) : [...styleTags];
      const material = noisy && rng() < 0.5 ? pick(rng, ALL_MATERIALS) : trueMaterial;
      const color = v === 0 ? (rng() < 0.7 ? pick(rng, family.colors) : pick(rng, ALL_COLORS)) : pick(rng, ALL_COLORS);
      const retailerId = v > 0 && rng() < 0.3 ? retailerFor(rng, family, config.retailerMix) : baseRetailer;
      const price = v === 0 ? basePrice : Math.round((basePrice * (0.9 + 0.2 * rng())) / 100) * 100;
      products.push({
        id,
        categoryId: type.categoryId,
        subcategoryId: type.id,
        retailerId,
        title: `${family.id} ${type.id} ${id}`,
        brand,
        description: 'Engine Lab fixture; not a real listing.',
        priceCents: price,
        currency: 'USD',
        imageUrls: [],
        productUrl: `https://${retailerId}.example.com/${id}`,
        styleTags: tags,
        material,
        color,
        createdAt: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
      });
      truth.set(id, {
        family: family.id,
        latent: v === 0 ? latent : latent.map((x) => x + 0.03 * gaussian(rng)),
        designId,
        quality,
        active: rng() >= config.inactiveShare,
      });
    }
  }

  const count = <K>(key: (p: Product) => K) => {
    const m = new Map<K, number>();
    for (const p of products) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    return new Map([...m].map(([k, c]) => [k, c / products.length]));
  };
  return {
    config,
    products,
    truth,
    retailerShare: count((p) => p.retailerId),
    familyShare: count((p) => truth.get(p.id)!.family),
  };
}
