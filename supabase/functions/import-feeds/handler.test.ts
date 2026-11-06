import { runImports, type FeedSource, type ImportDeps, type ProductRow, type RunResult } from './handler.ts';

const SOURCE: FeedSource = {
  id: 'awin-9',
  network: 'awin',
  advertiser_id: '9',
  feed_id: '123',
  name: 'Example Rugs Co',
  domain: 'shop.example.com',
  enabled: true,
  max_products: 2000,
};

const HEADER =
  'aw_deep_link,product_name,aw_product_id,merchant_image_url,search_price,merchant_id,merchant_deep_link,in_stock';
const line = (id: string, name: string, price: string) =>
  `https://track.example.com/c?p=${id},"${name}",${id},https://img.example.com/${id}.jpg,${price},9,https://shop.example.com/products/p${id},1`;
const FEED = [
  HEADER,
  line('1', "Maui Rug in Black - 5' X 8'", '334'),
  line('2', 'Oslo Walnut Coffee Table', '549'),
].join('\n');

function fakeDeps(feed: string | Error, overrides: Partial<ImportDeps> = {}) {
  const calls = {
    upserted: [] as ProductRow[],
    deactivated: [] as string[],
    runs: [] as RunResult[],
    retailers: [] as string[],
  };
  const deps: ImportDeps = {
    listSources: async () => [SOURCE, { ...SOURCE, id: 'awin-10', enabled: false }],
    download: async () => {
      if (feed instanceof Error) throw feed;
      return feed;
    },
    saveRetailer: async (s) => void calls.retailers.push(s.id),
    upsertProducts: async (rows) => void calls.upserted.push(...rows),
    deactivateStale: async (retailerId, before) => {
      calls.deactivated.push(`${retailerId}<${before}`);
      return 4;
    },
    startRun: async () => 'run-1',
    finishRun: async (_id, r) => void calls.runs.push(r),
    probe: async (url) => ({ ok: true, status: 200, finalUrl: url, contentType: 'image/jpeg', size: 50_000 }),
    now: () => new Date('2026-11-07T03:00:00Z'),
    ...overrides,
  };
  return { deps, calls };
}

describe('nightly import', () => {
  it('imports enabled stores, saves products and hides what disappeared', async () => {
    const { deps, calls } = fakeDeps(FEED);
    const out = await runImports(deps);
    expect(out).toEqual([expect.objectContaining({ source: 'awin-9' })]);
    expect(calls.retailers).toEqual(['awin-9']);
    expect(calls.upserted.map((r) => r.title).sort()).toEqual(['Maui Rug in Black', 'Oslo Walnut Coffee Table']);
    expect(calls.upserted[0]).toMatchObject({
      is_active: true,
      updated_at: '2026-11-07T03:00:00.000Z',
      retailer_id: 'awin-9',
    });
    expect(calls.deactivated).toEqual(['awin-9<2026-11-07T03:00:00.000Z']);
    expect(calls.runs[0]).toMatchObject({ status: 'ok', imported: 2, deactivated: 4 });
  });

  it('changes nothing when the feed comes back empty', async () => {
    const { deps, calls } = fakeDeps(HEADER);
    await runImports(deps);
    expect(calls.upserted).toEqual([]);
    expect(calls.deactivated).toEqual([]);
    expect(calls.runs[0]).toMatchObject({ status: 'failed' });
  });

  it('records a failed download and moves on', async () => {
    const { deps, calls } = fakeDeps(new Error('Awin feed download failed (403).'));
    const out = await runImports(deps);
    expect(out[0].result).toEqual({ status: 'failed', error: 'Awin feed download failed (403).' });
    expect(calls.deactivated).toEqual([]);
  });

  it('a broken feed hides that store’s products instead of showing broken cards', async () => {
    const { deps, calls } = fakeDeps(FEED, {
      probe: async (url) => ({ ok: false, status: 404, finalUrl: url, contentType: 'text/html', size: null }),
    });
    await runImports(deps);
    expect(calls.upserted).toEqual([]);
    expect(calls.deactivated).toHaveLength(1);
    expect(calls.runs[0].report?.skipped).toMatchObject({ 'image-broken': 2 });
  });

  it('can run a single store', async () => {
    const { deps } = fakeDeps(FEED, { listSources: async (only) => [{ ...SOURCE, id: only ?? 'x' }] });
    const out = await runImports(deps, 'awin-77');
    expect(out.map((o) => o.source)).toEqual(['awin-77']);
  });
});
