/**
 * Sample catalog generator.
 *
 * Everything here is fictional: made-up retailers and brands, `*.example.com`
 * URLs, and placeholder photos. Never add names that imitate a real store.
 *
 * `generateCatalog()` gives the 144-product launch sample (24 per category).
 * Pass a bigger `perCategory` (e.g. 2000) for load testing.
 */
import { createRng, pick, pickSome, type Rng } from '@/recommendation/random';
import type { Category, CategoryId, Product, Retailer } from '@/domain/types';

export const CATEGORIES: Category[] = [
  { id: 'furniture', label: 'Furniture', sortOrder: 1 },
  { id: 'clothing', label: 'Clothing', sortOrder: 2 },
  { id: 'bedding', label: 'Bedding', sortOrder: 3 },
  { id: 'decor', label: 'Decor', sortOrder: 4 },
  { id: 'footwear', label: 'Footwear', sortOrder: 5 },
  { id: 'collectibles', label: 'Collectibles', sortOrder: 6 },
];

export const RETAILERS: Retailer[] = [
  { id: 'fern-fold', name: 'Fern & Fold', domain: 'fernandfold.example.com' },
  { id: 'quarry-house', name: 'Quarry House', domain: 'quarryhouse.example.com' },
  { id: 'loom-lane', name: 'Loom Lane', domain: 'loomlane.example.com' },
  { id: 'northpine', name: 'Northpine Supply', domain: 'northpine.example.com' },
  { id: 'atelier-oro', name: 'Atelier Oro', domain: 'atelieroro.example.com' },
  { id: 'pebble-co', name: 'Pebble & Co', domain: 'pebbleco.example.com' },
  { id: 'kiln-kettle', name: 'Kiln & Kettle', domain: 'kilnandkettle.example.com' },
  { id: 'stride-lab', name: 'Stride Lab', domain: 'stridelab.example.com' },
];

/** Shared style vocabulary so taste carries across categories. */
export const STYLES = [
  'minimal',
  'mid-century',
  'industrial',
  'bohemian',
  'coastal',
  'classic',
  'scandinavian',
  'rustic',
  'vintage',
  'maximalist',
  'modern',
  'sporty',
] as const;

const COLORS = [
  'black',
  'white',
  'oatmeal',
  'walnut',
  'sage',
  'navy',
  'terracotta',
  'charcoal',
  'blush',
  'olive',
  'cream',
  'rust',
] as const;

const BRANDS = [
  'Halden',
  'Mossgrove',
  'Ostra',
  'Brindle & Vane',
  'Calder Row',
  'Juniper Atlas',
  'Wrenfield',
  'Solvei',
  'Tamsin Oak',
  'Ember Works',
  'Pellow',
  'Arlo Marsh',
] as const;

interface CategorySpec {
  nouns: string[];
  materials: string[];
  /** Price range in whole dollars. */
  price: [number, number];
  styles: (typeof STYLES)[number][];
  retailers: string[];
}

const SPECS: Record<CategoryId, CategorySpec> = {
  furniture: {
    nouns: ['lounge chair', 'sofa', 'side table', 'dining chair', 'bookshelf', 'coffee table', 'sideboard', 'bench'],
    materials: ['walnut', 'oak', 'steel', 'rattan', 'boucle', 'linen', 'leather'],
    price: [120, 2400],
    styles: ['minimal', 'mid-century', 'industrial', 'scandinavian', 'rustic', 'modern', 'coastal', 'vintage'],
    retailers: ['fern-fold', 'quarry-house', 'northpine', 'kiln-kettle'],
  },
  clothing: {
    nouns: [
      'overshirt',
      'knit sweater',
      'chore jacket',
      'wide-leg trousers',
      'linen shirt',
      'wool coat',
      'tee',
      'cardigan',
    ],
    materials: ['cotton', 'linen', 'merino', 'denim', 'cashmere', 'corduroy'],
    price: [28, 480],
    styles: ['minimal', 'classic', 'vintage', 'bohemian', 'sporty', 'modern', 'coastal', 'maximalist'],
    retailers: ['loom-lane', 'atelier-oro', 'pebble-co', 'stride-lab'],
  },
  bedding: {
    nouns: ['duvet cover', 'sheet set', 'quilt', 'throw blanket', 'pillowcase pair', 'waffle blanket'],
    materials: ['linen', 'percale cotton', 'sateen cotton', 'wool', 'bamboo lyocell'],
    price: [35, 420],
    styles: ['minimal', 'coastal', 'bohemian', 'classic', 'scandinavian', 'rustic', 'maximalist'],
    retailers: ['loom-lane', 'fern-fold', 'quarry-house'],
  },
  decor: {
    nouns: ['table lamp', 'vase', 'wall mirror', 'area rug', 'candle holder', 'print', 'planter', 'tray'],
    materials: ['ceramic', 'brass', 'glass', 'jute', 'travertine', 'oak', 'wool'],
    price: [18, 640],
    styles: ['minimal', 'mid-century', 'bohemian', 'maximalist', 'scandinavian', 'vintage', 'industrial', 'modern'],
    retailers: ['kiln-kettle', 'fern-fold', 'quarry-house', 'pebble-co'],
  },
  footwear: {
    nouns: ['loafer', 'runner', 'chelsea boot', 'court sneaker', 'sandal', 'derby shoe', 'hiking boot'],
    materials: ['suede', 'leather', 'canvas', 'knit mesh', 'nubuck'],
    price: [45, 390],
    styles: ['minimal', 'classic', 'sporty', 'vintage', 'rustic', 'modern', 'industrial'],
    retailers: ['stride-lab', 'atelier-oro', 'pebble-co', 'northpine'],
  },
  collectibles: {
    nouns: [
      'art print',
      'vinyl figure',
      'enamel pin set',
      'trading card box',
      'die-cast model',
      'film poster',
      'ceramic figurine',
    ],
    materials: ['paper', 'vinyl', 'enamel', 'die-cast metal', 'resin', 'ceramic'],
    price: [12, 750],
    styles: ['vintage', 'maximalist', 'modern', 'mid-century', 'minimal', 'classic', 'industrial'],
    retailers: ['pebble-co', 'kiln-kettle', 'atelier-oro'],
  },
};

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function roundPrice(rng: Rng, [min, max]: [number, number]): number {
  // Skew toward the lower end, like real catalogs.
  const t = Math.pow(rng(), 1.6);
  const dollars = min + t * (max - min);
  const step = dollars > 500 ? 50 : dollars > 100 ? 10 : 1;
  return Math.max(min, Math.round(dollars / step) * step - (step === 1 ? 0 : 1)) * 100;
}

export interface GenerateCatalogOptions {
  perCategory?: number;
  seed?: number;
}

export function generateCatalog({ perCategory = 24, seed = 42 }: GenerateCatalogOptions = {}): Product[] {
  const rng = createRng(seed);
  const products: Product[] = [];
  const baseTime = Date.UTC(2026, 0, 1);

  for (const category of CATEGORIES) {
    const spec = SPECS[category.id];
    for (let i = 0; i < perCategory; i++) {
      const id = `${category.id}-${String(i + 1).padStart(4, '0')}`;
      const styleTags = pickSome(rng, spec.styles, 1 + Math.floor(rng() * 2));
      const material = pick(rng, spec.materials);
      const color = pick(rng, COLORS);
      const noun = pick(rng, spec.nouns);
      const brand = pick(rng, BRANDS);
      const retailerId = pick(rng, spec.retailers);
      const retailer = RETAILERS.find((r) => r.id === retailerId);
      if (!retailer) throw new Error(`Unknown retailer ${retailerId}`);
      const photoCount = 2 + Math.floor(rng() * 3);
      const slug = `${color}-${material}-${noun}`.replace(/[^a-z0-9]+/g, '-');

      products.push({
        id,
        categoryId: category.id,
        retailerId: retailer.id,
        title: `${titleCase(color)} ${material} ${noun}`,
        brand,
        description: `A ${styleTags.join(', ')} ${noun} in ${color} ${material}. Sample product for testing; not a real listing.`,
        priceCents: roundPrice(rng, spec.price),
        currency: 'USD',
        imageUrls: Array.from(
          { length: photoCount },
          (_, n) => `https://picsum.photos/seed/swipeshop-${id}-${n}/900/1200`,
        ),
        productUrl: `https://${retailer.domain}/products/${slug}-${id}`,
        styleTags,
        material,
        color,
        createdAt: new Date(baseTime + (i * CATEGORIES.length + category.sortOrder) * 3_600_000).toISOString(),
      });
    }
  }
  return products;
}
