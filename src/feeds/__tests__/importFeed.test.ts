import { parseCsv } from '../csv';
import { classifyType, readColour, readMaterial, readStyles } from '../classify';
import { importFeed } from '../importFeed';
import { cleanText, sizeArea, splitVariantName } from '../text';
import type { ProbeResult } from '../types';

// A fictional Awin-style feed (example.com only, like all our sample data).
const HEADER =
  'aw_deep_link,product_name,aw_product_id,merchant_image_url,description,merchant_category,search_price,merchant_name,merchant_id,currency,merchant_deep_link,brand_name,in_stock,parent_product_id';
const row = (id: string, name: string, price: string, extra: Partial<Record<string, string>> = {}) => {
  const slug = (extra.slug ?? name.split(' - ')[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const cells = {
    aw_deep_link: `https://track.example.com/click?p=${id}&a=1&m=9`,
    product_name: name,
    aw_product_id: id,
    merchant_image_url: `https://img.example.com/${slug}.jpg`,
    description: extra.description ?? 'A lovely piece.',
    merchant_category: extra.category ?? '',
    search_price: price,
    merchant_name: 'Example Rugs Co',
    merchant_id: '9',
    currency: 'USD',
    merchant_deep_link: `https://shop.example.com/products/${slug}?variant=${id}`,
    brand_name: extra.brand ?? 'RHO-S157R024X036',
    in_stock: extra.in_stock ?? '1',
    parent_product_id: '',
  };
  return Object.values(cells)
    .map((v) => `"${v.replace(/"/g, '""')}"`)
    .join(',');
};

const FEED = [
  HEADER,
  row('1', "Maui Braided Rug in Black - 2' X 3' Oval", '86'),
  row('2', "Maui Braided Rug in Black - 5' X 8' Oval", '334'),
  row('3', "Maui Braided Rug in Black - 8' X 10' Oval", '510'),
  row('4', "Ridgewood Kitchen Rug - Gray / 5' X 8' Oval", '276', { slug: 'ridgewood' }),
  row('5', "Ridgewood Kitchen Rug - Blue / 5' X 8' Oval", '276', { slug: 'ridgewood' }),
  row('6', "Juvi Playroom Braided Rug in Lime - 4' Round", '120'),
  row('7', 'Oslo Mid-Century Walnut Coffee Table', '549', { description: 'Solid walnut with tapered legs.' }),
  row('8', 'Harbor Outdoor Sectional', '1299'),
  row('9', 'Cloud Memory Foam Mattress - Queen', '899'),
  row('10', "Felt Rug Pad - 5' X 8'", '39'),
  row('11', 'Ghost Dining Chair', '0'),
  row('12', 'Linen Accent Chair', '420', { in_stock: '0' }),
  row('13', 'Velvet Sofa in Emerald', '1499', { brand: 'Halden' }),
].join('\n');

describe('csv', () => {
  it('reads quotes, commas, doubled quotes, line breaks and a BOM', () => {
    const rows = parseCsv('﻿a,b\n"x, y","say ""hi"""\r\n"multi\nline",2\n');
    expect(rows).toEqual([
      { a: 'x, y', b: 'say "hi"' },
      { a: 'multi\nline', b: '2' },
    ]);
  });
});

describe('text', () => {
  it('cleans HTML, entities and garbled punctuation', () => {
    expect(cleanText('<p>Soft&nbsp;as your jeansâ€”really &amp; truly</p>')).toBe('Soft as your jeans—really & truly');
  });
  it('splits sizes and colour variants out of names', () => {
    expect(splitVariantName("Maui Rug in Black - 7' X 9' Oval")).toEqual({
      title: 'Maui Rug in Black',
      colour: null,
      size: "7' X 9' Oval",
    });
    expect(splitVariantName("Ridgewood Rug - Gray / 5' X 8' Oval")).toEqual({
      title: 'Ridgewood Rug in Gray',
      colour: 'Gray',
      size: "5' X 8' Oval",
    });
    // A dash that isn't a size stays in the name.
    expect(splitVariantName('Cane Chair - Natural Rattan').title).toBe('Cane Chair - Natural Rattan');
  });
  it('measures rug sizes', () => {
    expect(sizeArea("5' X 8' Oval")).toBe(40);
    expect(sizeArea('7\'6" x 9\'6"')).toBeCloseTo(71.25);
    expect(sizeArea("8' Round")).toBeCloseTo(50.27, 1);
    expect(sizeArea('Queen')).toBeNull();
  });
});

describe('classify', () => {
  const type = (title: string, cat = '') => {
    const r = classifyType(title, cat);
    return 'type' in r ? r.type : r.skip;
  };
  it('sorts into our product types', () => {
    expect(type('Ellis Counter Height Bar Stool')).toBe('bar-stools');
    expect(type('Wishbone Dining Chair')).toBe('dining-chairs');
    expect(type('Oak Extendable Dining Table')).toBe('dining-tables');
    expect(type('Round Marble Coffee Table')).toBe('coffee-tables');
    expect(type('Fluted Media Console')).toBe('tv-stands');
    expect(type('Two-Drawer Bedside Table')).toBe('nightstands');
    expect(type('Six-Drawer Dresser')).toBe('dressers');
    expect(type('Upholstered Platform Bed')).toBe('bed-frames');
    expect(type('Modular Sectional')).toBe('sofas');
    expect(type('Swivel Lounge Chair')).toBe('accent-chairs');
    expect(type('Hand-Knotted Wool Area Rug')).toBe('rugs');
    expect(type('Sanford', 'Home > Rugs > Braided Rug')).toBe('rugs');
  });
  it('leaves out what we do not sell', () => {
    expect(type('Teak Patio Dining Table')).toBe('out-of-scope');
    expect(type('Kids Bunk Bed')).toBe('out-of-scope');
    expect(type('Ergonomic Office Chair')).toBe('out-of-scope');
    expect(type('Memory Foam Mattress')).toBe('out-of-scope');
    expect(type('Felt Rug Pad')).toBe('out-of-scope');
    expect(type('Linen Table Runner')).toBe('out-of-scope');
    expect(type('Ceramic Table Lamp')).toBe('not-our-category');
    // "Indoor/outdoor" rugs are fine; "baby blue" isn't a nursery item.
    expect(type('Indoor/Outdoor Braided Rug')).toBe('rugs');
    expect(type('Baby Blue Shag Rug')).toBe('rugs');
  });
  it('reads colour, material and style', () => {
    expect(readColour('Pura Wool Rug in Terra Cotta', '', '')).toBe('terracotta');
    expect(readColour('Throw', 'Charcoal Grey', '')).toBe('charcoal');
    expect(readColour('Patterned rug', '', '')).toBe('multi');
    expect(readMaterial('Oslo Walnut Coffee Table', 'with steel legs')).toBe('walnut');
    expect(readStyles('Mid-Century Walnut Table', 'clean lines')).toEqual(['mid-century', 'minimal']);
    expect(readStyles('Plain thing', '')).toEqual(['modern']);
  });
});

describe('importFeed', () => {
  const source = { retailerId: 'awin-9', network: 'awin' as const };

  it('turns a feed into catalog products and a clear report', async () => {
    const { products, report } = await importFeed(parseCsv(FEED), source);
    const titles = products.map((p) => p.title).sort();
    expect(titles).toEqual([
      'Maui Braided Rug in Black',
      'Oslo Mid-Century Walnut Coffee Table',
      'Ridgewood Kitchen Rug in Blue',
      'Ridgewood Kitchen Rug in Gray',
      'Velvet Sofa in Emerald',
    ]);
    // Sizes grouped; the 5' x 8' is the one shown.
    const maui = products.find((p) => p.title.startsWith('Maui'))!;
    expect(maui.priceCents).toBe(33400);
    // Ids come from the product group, so they don't change when a size sells out.
    expect(maui.id).toMatch(/^awin-9-[0-9a-z]{8,}$/);
    expect(maui.productUrl).toBe('https://track.example.com/click?p=2&a=1&m=9');
    expect(maui).toMatchObject({ categoryId: 'living-room', subcategoryId: 'rugs', color: 'black' });
    // Stock-code "brands" are dropped; real ones kept.
    expect(maui.brand).toBe('');
    expect(products.find((p) => p.title.startsWith('Velvet'))!.brand).toBe('Halden');
    expect(report).toMatchObject({
      rows: 13,
      imported: 5,
      skipped: { 'out-of-scope': 4, 'bad-price': 1, 'out-of-stock': 1 },
      byType: { rugs: 3, 'coffee-tables': 1, sofas: 1 },
    });
    expect(report.examples['out-of-scope']).toContain('Harbor Outdoor Sectional');
  });

  it('health check drops dead photos and links that redirect away', async () => {
    const probe = async (url: string, kind: 'image' | 'page'): Promise<ProbeResult> => {
      if (kind === 'image') {
        const dead = url.includes('ridgewood');
        return { ok: !dead, status: dead ? 404 : 200, finalUrl: url, contentType: 'image/jpeg', size: 40_000 };
      }
      const moved = url.includes('velvet');
      return {
        ok: true,
        status: 200,
        finalUrl: moved ? 'https://shop.example.com/collections/all' : url,
        contentType: 'text/html',
        size: null,
      };
    };
    const { products, report } = await importFeed(parseCsv(FEED), source, { probe });
    expect(products.map((p) => p.title).sort()).toEqual([
      'Maui Braided Rug in Black',
      'Oslo Mid-Century Walnut Coffee Table',
    ]);
    expect(report.skipped).toMatchObject({ 'image-broken': 2, 'link-redirects-away': 1 });
  });

  it('treats tiny images as missing-photo placeholders', async () => {
    const probe = async (url: string): Promise<ProbeResult> => ({
      ok: true,
      status: 200,
      finalUrl: url,
      contentType: 'image/gif',
      size: 959,
    });
    const { report } = await importFeed(parseCsv(FEED), source, { probe });
    expect(report.imported).toBe(0);
    expect(report.skipped['image-broken']).toBe(5);
  });

  it('groups sizes by name even when every size has its own page', async () => {
    const feed = [
      HEADER,
      row('21', "Tide Rug in Sand - 2' X 3'", '60', { slug: 'tide-2x3' }),
      row('22', "Tide Rug in Sand - 5' X 8'", '240', { slug: 'tide-5x8' }),
    ].join('\n');
    const { products } = await importFeed(parseCsv(feed), source);
    expect(products).toHaveLength(1);
    expect(products[0].priceCents).toBe(24000);
  });

  it('caps products per feed but keeps every type represented', async () => {
    const { products, report } = await importFeed(parseCsv(FEED), source, { maxProducts: 3 });
    expect(products).toHaveLength(3);
    expect(new Set(products.map((p) => p.subcategoryId))).toEqual(new Set(['rugs', 'coffee-tables', 'sofas']));
    expect(report.skipped['over-limit']).toBe(2);
  });

  it('stops health checks when out of time and says so', async () => {
    let t = 0;
    const probe = async (url: string): Promise<ProbeResult> => {
      t += 60_000;
      return { ok: true, status: 200, finalUrl: url, contentType: 'image/jpeg', size: 50_000 };
    };
    const { report } = await importFeed(parseCsv(FEED), source, {
      probe,
      concurrency: 1,
      timeBudgetMs: 100_000,
      now: () => t,
    });
    expect(report.skipped['not-checked-yet']).toBeGreaterThan(0);
    expect(report.imported + (report.skipped['not-checked-yet'] ?? 0)).toBe(5);
  });

  const okImage = (url: string): ProbeResult => ({
    ok: true,
    status: 200,
    finalUrl: url,
    contentType: 'image/jpeg',
    size: 50_000,
  });
  const page = (url: string, status: number): ProbeResult => ({
    ok: status < 400,
    status,
    finalUrl: url,
    contentType: 'text/html',
    size: null,
  });
  const noWait = async () => {};

  it('waits and retries when a store says "too many requests", instead of calling pages broken', async () => {
    const seen = new Map<string, number>();
    const waits: number[] = [];
    const probe = async (url: string, kind: 'image' | 'page'): Promise<ProbeResult> => {
      if (kind === 'image') return okImage(url);
      const n = (seen.get(url) ?? 0) + 1;
      seen.set(url, n);
      return page(url, n === 1 ? 429 : 200);
    };
    const { report } = await importFeed(parseCsv(FEED), source, { probe, sleep: async (ms) => void waits.push(ms) });
    expect(report.imported).toBe(5);
    expect(report.skipped['link-broken']).toBeUndefined();
    expect(waits.filter((ms) => ms >= 10_000).length).toBe(5);
    expect(report.pageCheck).toMatchObject({ checked: 5, broken: 0, stale: false });
  });

  it('keeps products when a store blocks every page visit (photos still checked)', async () => {
    const probe = async (url: string, kind: 'image' | 'page') => (kind === 'image' ? okImage(url) : page(url, 429));
    const { report } = await importFeed(parseCsv(FEED), source, { probe, sleep: noWait });
    expect(report.imported).toBe(5);
    expect(report.pageCheck).toMatchObject({ checked: 0, stale: false });
  });

  it('treats a feed whose sampled pages are mostly gone as out of date', async () => {
    const probe = async (url: string, kind: 'image' | 'page') => (kind === 'image' ? okImage(url) : page(url, 404));
    const { report } = await importFeed(parseCsv(FEED), source, { probe, sleep: noWait });
    expect(report.imported).toBe(0);
    expect(report.pageCheck).toMatchObject({ stale: true });
  });

  it('visits only a sample of store pages, one at a time', async () => {
    let pages = 0;
    let open = 0;
    let most = 0;
    const probe = async (url: string, kind: 'image' | 'page') => {
      if (kind === 'image') return okImage(url);
      pages++;
      most = Math.max(most, ++open);
      await Promise.resolve();
      open--;
      return page(url, 200);
    };
    const { report } = await importFeed(parseCsv(FEED), source, { probe, pageSample: 2, sleep: noWait });
    expect(pages).toBe(2);
    expect(most).toBe(1);
    expect(report.imported).toBe(5);
  });
});
