/**
 * Awin's newer "Google" feed format (Google Shopping columns: id, title, link,
 * image_link, price "169.99 USD", availability "in_stock", aw_deep_link …) → FeedItem.
 *
 * Most of these stores run on Shopify, where every size and colour is its own row
 * named "Product - Option / Option / Option" and all of them share one product page.
 */
import { urlPath } from './awin';
import { namesColour } from './classify';
import { cleanText } from './text';
import type { FeedItem } from './types';

/** True when a parsed CSV row is in the Google format rather than the classic Awin one. */
export function isGoogleRow(row: Record<string, string>): boolean {
  return 'image_link' in row && 'title' in row && !('product_name' in row);
}

const httpsOnly = (u: string | undefined) => {
  const t = (u ?? '').trim();
  if (t.startsWith('https://')) return t;
  if (t.startsWith('http://')) return `https://${t.slice(7)}`;
  if (t.startsWith('//')) return `https:${t}`;
  return '';
};

/** "169.99 USD" → { cents: 16999, currency: 'USD' }. */
export function parseGooglePrice(raw: string | undefined): { cents: number; currency: string } {
  const t = (raw ?? '').trim();
  const n = Number.parseFloat(t.replace(/[^0-9.]/g, ''));
  const currency = t.match(/\b([A-Z]{3})\b/)?.[1] ?? 'USD';
  return { cents: Number.isFinite(n) ? Math.round(n * 100) : 0, currency };
}

/**
 * Store page builders leak their CSS into descriptions
 * (".image-with-text__content { flex-direction: column; } @media …"). Drop it.
 */
export function stripCss(text: string): string {
  let t = text;
  for (let i = 0; i < 4; i++) {
    const next = t
      .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ' ')
      // Selectors start with a class or id (".hero__wrap img {"), so sentences before them survive.
      // Each step starts with a character a word can't contain, so this can't backtrack badly.
      .replace(/(^|\s)[.#][\w-]+(?:[ >+~,]*[.#:][\w-]+|[ >+~,]+[\w-]+)*\s*\{[^{}]*\}/g, '$1');
    if (next === t) break;
    t = next;
  }
  // Anything left after a stray brace is style noise too.
  const brace = t.search(/[{}]/);
  if (brace >= 0) t = t.slice(0, brace);
  return t.replace(/\s+/g, ' ').trim();
}

export interface VariantName {
  /** "Savanna Buffet Cabinet, Boho Style". */
  base: string;
  /** The option that names a colour ("Black Oak"), or ''. */
  colour: string;
  /** The other options ("1 Piece"), or ''. */
  size: string;
}

/**
 * "Savanna Buffet Cabinet, Boho Style - 1 Piece / Black Oak" → base, colour "Black Oak", size "1 Piece".
 * Only a short tail is treated as options, so "Desk - Modern Writing Table with Drawers" stays whole.
 */
export function splitShopifyTitle(title: string): VariantName {
  const clean = cleanText(title);
  const at = clean.lastIndexOf(' - ');
  if (at < 0) return { base: clean, colour: '', size: '' };
  const tail = clean.slice(at + 3).trim();
  const options = tail
    .split(' / ')
    .map((o) => o.trim())
    .filter(Boolean);
  const isOptions = options.length > 1 || tail.split(/\s+/).length <= 4;
  if (!isOptions || options.length === 0) return { base: clean, colour: '', size: '' };
  // The colour option, else (for "1 Piece / Reclaimed Caramel Oak") the last option, usually the finish.
  const named = options.findIndex(namesColour);
  const finish = options.length - 1;
  const colourIndex = named >= 0 ? named : options.length > 1 && !looksLikeSizeOption(options[finish]) ? finish : -1;
  const colour = colourIndex >= 0 ? options[colourIndex] : '';
  const rest = options.filter((_, i) => i !== colourIndex);
  // A lone option that isn't a colour or a size ("Rustic") still tells variants apart: keep it with the colour.
  if (colourIndex < 0 && options.length === 1 && !looksLikeSizeOption(options[0]))
    return { base: clean.slice(0, at).trim(), colour: options[0], size: '' };
  return { base: clean.slice(0, at).trim(), colour, size: rest.join(' / ') };
}

/** "1 Piece", "Set of 2", "6-Drawer", "3'x5", "Queen": options that are a size or quantity, not a finish. */
function looksLikeSizeOption(option: string): boolean {
  return /\d|\b(pieces?|sets?|pack|pairs?|twin|full|queen|king|small|medium|large|standard)\b/i.test(option);
}

export function googleRowToItem(row: Record<string, string>): FeedItem {
  const name = splitShopifyTitle(row.title ?? '');
  const merchantUrl = httpsOnly(row.link);
  const regular = parseGooglePrice(row.price);
  const sale = parseGooglePrice(row.sale_price);
  const priceCents = sale.cents > 0 && sale.cents < regular.cents ? sale.cents : regular.cents;
  const images = [row.image_link, ...(row.additional_image_link ?? '').split(','), row.lifestyle_image_link]
    .map(httpsOnly)
    .filter((u, i, all) => u && all.indexOf(u) === i);
  const availability = (row.availability ?? '').toLowerCase().replace(/\s+/g, '_');
  // Variants of one product share a product page (or an item group); each colour is its own card.
  const groupBase = (row.item_group_id ?? '').trim() || (merchantUrl ? urlPath(merchantUrl) : name.base.toLowerCase());
  const advertiser = (row.advertiser_id ?? row['﻿advertiser_id'] ?? '').trim();
  return {
    externalId: (row.id ?? '').trim(),
    groupKey: `${advertiser}|${groupBase}|${name.colour.toLowerCase()}`,
    title: name.colour ? `${name.base} in ${name.colour}` : name.base,
    sizeLabel: name.size,
    description: stripCss(cleanText(row.description)),
    priceCents,
    currency: regular.currency,
    imageUrls: images,
    trackingUrl: httpsOnly(row.aw_deep_link),
    merchantUrl,
    inStock:
      availability === '' || availability === 'in_stock' || availability === 'preorder' || availability === 'backorder',
    brand: cleanText(row.brand),
    categoryText: [row.google_product_category, row.product_type].map(cleanText).filter(Boolean).join(' · '),
    colourField: cleanText(row.color) || name.colour,
  };
}
