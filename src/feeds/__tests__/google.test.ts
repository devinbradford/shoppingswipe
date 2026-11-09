import { classifyType } from '../classify';
import { googleRowToItem, isGoogleRow, parseGooglePrice, splitShopifyTitle, stripCss } from '../google';
import { importFeed, stableId } from '../importFeed';
import { parseCsv } from '../csv';

const HEADER =
  'advertiser_id,advertiser_name,id,title,description,link,image_link,additional_image_link,aw_deep_link,google_product_category,product_type,brand,availability,price,sale_price,color,item_group_id';
const row = (id: string, title: string, price: string, extra: Partial<Record<string, string>> = {}) => {
  const r: Record<string, string> = {
    advertiser_id: '9',
    advertiser_name: 'Example Home',
    id,
    title,
    description:
      'Solid oak. .hero__wrap { display: flex; } @media (max-width: 740px) { .hero { font-size: 14px; } } More text',
    link: `https://shop.example.com/products/oak-nightstand?variant=${id}`,
    image_link: `https://img.example.com/${id}.jpg`,
    additional_image_link: '',
    aw_deep_link: `https://track.example.com/c?p=${id}`,
    google_product_category: 'Home & Garden > Furniture > Bedroom',
    product_type: '',
    brand: 'Example Home',
    availability: 'in_stock',
    price,
    sale_price: '',
    color: '',
    item_group_id: '',
    ...extra,
  };
  return HEADER.split(',')
    .map((k) => `"${(r[k] ?? '').replace(/"/g, '""')}"`)
    .join(',');
};

describe('Google-format feeds', () => {
  it('reads prices with currency and prefers a lower sale price', () => {
    expect(parseGooglePrice('169.99 USD')).toEqual({ cents: 16999, currency: 'USD' });
    const [r] = parseCsv(
      [HEADER, row('1', 'Oak Nightstand - White', '200.00 USD', { sale_price: '150.00 USD' })].join('\n'),
    );
    expect(isGoogleRow(r)).toBe(true);
    expect(googleRowToItem(r).priceCents).toBe(15000);
  });

  it('splits Shopify variant names into product, colour and size', () => {
    expect(splitShopifyTitle('Savanna Buffet Cabinet, Boho Style - 1 Piece / Black Oak')).toEqual({
      base: 'Savanna Buffet Cabinet, Boho Style',
      colour: 'Black Oak',
      size: '1 Piece',
    });
    // No colour word: the last option is the finish, unless it's a size.
    expect(splitShopifyTitle('Cabinet - 2 Pieces / Reclaimed Caramel Oak').colour).toBe('Reclaimed Caramel Oak');
    expect(splitShopifyTitle('Bed Frame - Queen / 1 Piece')).toMatchObject({ colour: '', size: 'Queen / 1 Piece' });
    expect(splitShopifyTitle('Ladder Bookshelf - Rustic')).toMatchObject({
      base: 'Ladder Bookshelf',
      colour: 'Rustic',
    });
    // A long tail is part of the name.
    expect(splitShopifyTitle('Desk - Modern Writing Table with Two Drawers').base).toBe(
      'Desk - Modern Writing Table with Two Drawers',
    );
  });

  it('drops page-builder CSS from descriptions', () => {
    expect(
      stripCss(
        'Solid oak. .hero__wrap { display: flex; } @media (max-width: 740px) { .hero { font-size: 14px; } } More',
      ),
    ).toBe('Solid oak. More');
  });

  it('groups sizes of one product page per colour, with an id that survives a size selling out', async () => {
    const feed = [
      HEADER,
      row('11', 'Oak Nightstand - Small / White', '120.00 USD'),
      row('12', 'Oak Nightstand - Large / White', '160.00 USD'),
      row('13', 'Oak Nightstand - Small / Black', '120.00 USD'),
    ].join('\n');
    const first = await importFeed(parseCsv(feed), { retailerId: 'awin-9', network: 'awin' });
    expect(first.products.map((p) => p.title).sort()).toEqual(['Oak Nightstand in Black', 'Oak Nightstand in White']);
    const white = first.products.find((p) => p.title.endsWith('White'))!;
    expect(white.priceCents).toBe(12000);
    expect(white.description).toBe('Solid oak. More text');

    const soldOut = feed.replace(
      row('11', 'Oak Nightstand - Small / White', '120.00 USD'),
      row('11', 'Oak Nightstand - Small / White', '120.00 USD', { availability: 'out_of_stock' }),
    );
    const second = await importFeed(parseCsv(soldOut), { retailerId: 'awin-9', network: 'awin' });
    const whiteAgain = second.products.find((p) => p.title.endsWith('White'))!;
    expect(whiteAgain.priceCents).toBe(16000);
    expect(whiteAgain.id).toBe(white.id);
  });

  it('stable ids are short and distinct', () => {
    expect(stableId('9|/products/a|white')).toBe(stableId('9|/products/a|white'));
    expect(stableId('9|/products/a|white')).not.toBe(stableId('9|/products/a|black'));
  });
});

describe('sorting real-world names', () => {
  const type = (title: string, cat = '') => {
    const r = classifyType(title, cat);
    return 'type' in r ? r.type : r.skip;
  };
  it('does not treat Google’s "Home & Garden" as garden furniture', () => {
    expect(type('Washable Area Rug 8x10', 'Home & Garden > Decor > Rugs')).toBe('rugs');
    expect(type('Teak Bench', 'Home & Garden > Lawn & Garden > Outdoor')).toBe('out-of-scope');
  });
  it('keeps look-alikes out of sofas and beds', () => {
    expect(type('Console Table, Farmhouse Sofa Table for Hallway')).toBe('not-our-category');
    expect(type('C-Shaped End Table, Wood Side Table for Couch Sofa')).toBe('not-our-category');
    expect(type('Upholstered End of Bed Bench for King Beds')).toBe('not-our-category');
    expect(type('Cooling Sofa Pad Set (5-Piece)')).toBe('out-of-scope');
    expect(type('47" Entryway Bench, Wooden Dining Table Bench')).toBe('not-our-category');
    expect(type('Dining Table Set with Bench')).toBe('dining-tables');
    expect(type('5 Drawer Chest, Rolling File Cabinet for Home Office')).toBe('out-of-scope');
    expect(type('Round End Table Sofa Side Table Small Coffee Table')).toBe('coffee-tables');
    expect(type('Compressed Modular Sectional Sofa')).toBe('sofas');
    expect(type('55" Console Table, Sofa Table TV Stand with Shelves')).toBe('tv-stands');
  });
});
