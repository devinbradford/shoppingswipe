/** Awin product feed rows (Create-a-Feed CSV) → FeedItem. */
import { cleanText, splitVariantName } from './text';
import type { FeedItem } from './types';

/** Columns we ask Awin for (see docs/PRODUCT-FEEDS.md). */
export const AWIN_COLUMNS = [
  'aw_deep_link',
  'product_name',
  'aw_product_id',
  'merchant_product_id',
  'merchant_image_url',
  'description',
  'merchant_category',
  'search_price',
  'merchant_name',
  'merchant_id',
  'category_name',
  'aw_image_url',
  'currency',
  'merchant_deep_link',
  'brand_name',
  'colour',
  'product_short_description',
  'keywords',
  'product_type',
  'merchant_product_category_path',
  'in_stock',
  'stock_status',
  'large_image',
  'alternate_image',
  'alternate_image_two',
  'alternate_image_three',
  'alternate_image_four',
  'parent_product_id',
] as const;

const httpsOnly = (u: string | undefined) => {
  const t = (u ?? '').trim();
  if (!t) return '';
  if (t.startsWith('https://')) return t;
  if (t.startsWith('http://')) return `https://${t.slice(7)}`;
  if (t.startsWith('//')) return `https:${t}`;
  return '';
};

/** Path of a URL without query or trailing slash ("/products/maui-rug"); '' if not a URL. */
export function urlPath(u: string): string {
  const m = u.match(/^https?:\/\/[^/]+(\/[^?#]*)?/i);
  return (m?.[1] ?? '/').replace(/\/+$/, '') || '/';
}

export function awinRowToItem(row: Record<string, string>): FeedItem {
  const split = splitVariantName(row.product_name ?? '');
  const merchantUrl = httpsOnly(row.merchant_deep_link);
  const images = [
    row.large_image,
    row.merchant_image_url,
    row.alternate_image,
    row.alternate_image_two,
    row.alternate_image_three,
    row.alternate_image_four,
  ]
    .map(httpsOnly)
    .filter((u, i, all) => u && all.indexOf(u) === i);
  // Brand columns in some feeds hold a stock code (e.g. "RHO-S157R024X036"); ignore those.
  const brand = cleanText(row.brand_name);
  const looksLikeCode = /^[A-Z0-9]+(-[A-Z0-9]+)+$/.test(brand) || /\d{4,}/.test(brand);
  const stock = `${row.in_stock ?? ''} ${row.stock_status ?? ''}`.toLowerCase();
  const price = Number.parseFloat((row.search_price ?? '').replace(/[^0-9.]/g, ''));
  // Sizes of one product share a parent id, or failing that the same name (which already
  // includes the colour, so colours stay separate cards). Product pages aren't reliable:
  // some stores give every size its own address.
  const parent = (row.parent_product_id ?? '').trim();
  const groupBase = parent || split.title.toLowerCase().replace(/\s+/g, ' ');
  return {
    externalId: (row.aw_product_id ?? row.merchant_product_id ?? '').trim(),
    groupKey: `${row.merchant_id ?? ''}|${groupBase}|${(split.colour ?? '').toLowerCase()}`,
    title: split.title,
    sizeLabel: split.size,
    description: cleanText(row.description || row.product_short_description),
    priceCents: Number.isFinite(price) ? Math.round(price * 100) : 0,
    currency: (row.currency || 'USD').trim().toUpperCase(),
    imageUrls: images,
    trackingUrl: httpsOnly(row.aw_deep_link),
    merchantUrl,
    inStock: !/\b(0|false|no|out of stock|discontinued)\b/.test(stock.trim()) || stock.trim() === '',
    brand: looksLikeCode ? '' : brand,
    categoryText: [
      row.merchant_category,
      row.category_name,
      row.product_type,
      row.merchant_product_category_path,
      row.keywords,
    ]
      .map(cleanText)
      .filter(Boolean)
      .join(' · '),
    colourField: cleanText(row.colour),
  };
}
