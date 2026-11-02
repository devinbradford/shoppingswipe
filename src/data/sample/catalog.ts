/**
 * Sample catalog generator: furniture only, organised by room and product type.
 *
 * Everything here is fictional: made-up retailers and brands, `*.example.com`
 * URLs, and placeholder photos. Never add names that imitate a real store.
 *
 * `generateCatalog()` gives the launch sample (16 per product type, 176 total).
 * Pass a bigger `perSubcategory` (e.g. 1100) for load testing.
 */
import type { Category, Product, Retailer, Subcategory, SubcategoryId } from '@/domain/types';
import { createRng, pick, pickSome, type Rng } from '@/recommendation/random';

export const CATEGORIES: Category[] = [
  { id: 'bedroom', label: 'Bedroom', sortOrder: 1 },
  { id: 'living-room', label: 'Living room', sortOrder: 2 },
  { id: 'kitchen-dining', label: 'Kitchen & dining', sortOrder: 3 },
];

export const SUBCATEGORIES: Subcategory[] = [
  { id: 'bed-frames', categoryId: 'bedroom', label: 'Bed frames', sortOrder: 1 },
  { id: 'nightstands', categoryId: 'bedroom', label: 'Nightstands', sortOrder: 2 },
  { id: 'dressers', categoryId: 'bedroom', label: 'Dressers', sortOrder: 3 },
  { id: 'sofas', categoryId: 'living-room', label: 'Sofas', sortOrder: 1 },
  { id: 'accent-chairs', categoryId: 'living-room', label: 'Accent chairs', sortOrder: 2 },
  { id: 'coffee-tables', categoryId: 'living-room', label: 'Coffee tables', sortOrder: 3 },
  { id: 'tv-stands', categoryId: 'living-room', label: 'TV stands', sortOrder: 4 },
  { id: 'rugs', categoryId: 'living-room', label: 'Rugs', sortOrder: 5 },
  { id: 'bar-stools', categoryId: 'kitchen-dining', label: 'Bar stools', sortOrder: 1 },
  { id: 'dining-tables', categoryId: 'kitchen-dining', label: 'Dining tables', sortOrder: 2 },
  { id: 'dining-chairs', categoryId: 'kitchen-dining', label: 'Dining chairs', sortOrder: 3 },
];

export const RETAILERS: Retailer[] = [
  { id: 'fern-fold', name: 'Fern & Fold', domain: 'fernandfold.example.com' },
  { id: 'quarry-house', name: 'Quarry House', domain: 'quarryhouse.example.com' },
  { id: 'loom-lane', name: 'Loom Lane', domain: 'loomlane.example.com' },
  { id: 'northpine', name: 'Northpine Supply', domain: 'northpine.example.com' },
  { id: 'atelier-oro', name: 'Atelier Oro', domain: 'atelieroro.example.com' },
  { id: 'pebble-co', name: 'Pebble & Co', domain: 'pebbleco.example.com' },
  { id: 'kiln-kettle', name: 'Kiln & Kettle', domain: 'kilnandkettle.example.com' },
  { id: 'hearth-row', name: 'Hearth Row', domain: 'hearthrow.example.com' },
];

/** Shared style vocabulary so taste carries across rooms and product types. */
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
  'farmhouse',
] as const;

type Style = (typeof STYLES)[number];

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

interface SubcategorySpec {
  nouns: string[];
  materials: string[];
  /** Price range in whole dollars. */
  price: [number, number];
  styles: Style[];
  retailers: string[];
}

const ALL_STYLES = [...STYLES];

const SPECS: Record<SubcategoryId, SubcategorySpec> = {
  'bed-frames': {
    nouns: ['upholstered bed', 'platform bed', 'wingback bed', 'storage bed', 'canopy bed', 'low-profile bed'],
    materials: ['linen', 'boucle', 'velvet', 'oak', 'walnut', 'steel'],
    price: [249, 1899],
    styles: ALL_STYLES,
    retailers: ['fern-fold', 'quarry-house', 'northpine', 'hearth-row'],
  },
  nightstands: {
    nouns: ['nightstand', 'bedside table', 'two-drawer nightstand', 'floating nightstand'],
    materials: ['oak', 'walnut', 'rattan', 'marble', 'lacquer', 'steel'],
    price: [79, 699],
    styles: ALL_STYLES,
    retailers: ['fern-fold', 'kiln-kettle', 'pebble-co', 'hearth-row'],
  },
  dressers: {
    nouns: ['six-drawer dresser', 'tall chest', 'double dresser', 'lowboy dresser'],
    materials: ['oak', 'walnut', 'cane', 'lacquer', 'pine'],
    price: [199, 1999],
    styles: ALL_STYLES,
    retailers: ['quarry-house', 'northpine', 'hearth-row'],
  },
  sofas: {
    nouns: ['sofa', 'sectional', 'loveseat', 'sleeper sofa', 'modular sofa', 'chaise sofa'],
    materials: ['boucle', 'linen', 'velvet', 'leather', 'performance weave'],
    price: [499, 3499],
    styles: ALL_STYLES,
    retailers: ['fern-fold', 'quarry-house', 'atelier-oro', 'hearth-row'],
  },
  'accent-chairs': {
    nouns: ['accent chair', 'lounge chair', 'swivel chair', 'armchair', 'barrel chair'],
    materials: ['boucle', 'velvet', 'leather', 'rattan', 'linen'],
    price: [149, 1499],
    styles: ALL_STYLES,
    retailers: ['fern-fold', 'atelier-oro', 'loom-lane', 'pebble-co'],
  },
  'coffee-tables': {
    nouns: ['coffee table', 'round coffee table', 'nesting tables', 'lift-top coffee table'],
    materials: ['oak', 'walnut', 'travertine', 'glass', 'marble', 'steel'],
    price: [99, 1299],
    styles: ALL_STYLES,
    retailers: ['kiln-kettle', 'quarry-house', 'pebble-co'],
  },
  'tv-stands': {
    nouns: ['media console', 'TV stand', 'low credenza', 'fluted media cabinet'],
    materials: ['oak', 'walnut', 'lacquer', 'cane', 'steel'],
    price: [149, 1299],
    styles: ALL_STYLES,
    retailers: ['northpine', 'quarry-house', 'hearth-row'],
  },
  rugs: {
    nouns: ['area rug', 'runner rug', 'round rug', 'shag rug', 'flatweave rug'],
    materials: ['wool', 'jute', 'cotton', 'viscose', 'sisal'],
    price: [59, 1499],
    styles: ALL_STYLES,
    retailers: ['loom-lane', 'pebble-co', 'fern-fold'],
  },
  'bar-stools': {
    nouns: ['counter stool', 'bar stool', 'swivel bar stool', 'backless counter stool'],
    materials: ['oak', 'walnut', 'leather', 'rattan', 'steel'],
    price: [59, 499],
    styles: ALL_STYLES,
    retailers: ['kiln-kettle', 'northpine', 'pebble-co'],
  },
  'dining-tables': {
    nouns: ['dining table', 'round dining table', 'extendable dining table', 'pedestal dining table'],
    materials: ['oak', 'walnut', 'travertine', 'marble', 'pine'],
    price: [299, 2999],
    styles: ALL_STYLES,
    retailers: ['quarry-house', 'kiln-kettle', 'hearth-row'],
  },
  'dining-chairs': {
    nouns: ['dining chair', 'upholstered dining chair', 'cane dining chair', 'dining armchair'],
    materials: ['oak', 'walnut', 'boucle', 'cane', 'leather'],
    price: [79, 699],
    styles: ALL_STYLES,
    retailers: ['kiln-kettle', 'fern-fold', 'hearth-row'],
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
  perSubcategory?: number;
  seed?: number;
}

export function generateCatalog({ perSubcategory = 16, seed = 42 }: GenerateCatalogOptions = {}): Product[] {
  const rng = createRng(seed);
  const products: Product[] = [];
  const baseTime = Date.UTC(2026, 0, 1);

  SUBCATEGORIES.forEach((sub, subIndex) => {
    const spec = SPECS[sub.id];
    for (let i = 0; i < perSubcategory; i++) {
      const id = `${sub.id}-${String(i + 1).padStart(4, '0')}`;
      const styleTags = pickSome(rng, spec.styles, 1 + Math.floor(rng() * 2));
      const material = pick(rng, spec.materials);
      const color = pick(rng, COLORS);
      const noun = pick(rng, spec.nouns);
      const brand = pick(rng, BRANDS);
      const retailerId = pick(rng, spec.retailers);
      const retailer = RETAILERS.find((r) => r.id === retailerId);
      if (!retailer) throw new Error(`Unknown retailer ${retailerId}`);
      const photoCount = 2 + Math.floor(rng() * 3);
      const slug = `${color}-${material}-${noun}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      products.push({
        id,
        categoryId: sub.categoryId,
        subcategoryId: sub.id,
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
        createdAt: new Date(baseTime + (i * SUBCATEGORIES.length + subIndex) * 3_600_000).toISOString(),
      });
    }
  });
  return products;
}
