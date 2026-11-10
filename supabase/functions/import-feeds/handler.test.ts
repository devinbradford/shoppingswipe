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

  it('takes only its own store’s rows from a combined download', async () => {
    const other = line('3', 'Other Store Sofa', '999').replace(',9,https', ',77,https');
    const { deps, calls } = fakeDeps([FEED, other].join('\n'));
    await runImports(deps);
    expect(calls.upserted.map((r) => r.title)).not.toContain('Other Store Sofa');
    expect(calls.upserted).toHaveLength(2);
  });

  it('can run a single store', async () => {
    const { deps } = fakeDeps(FEED, { listSources: async (only) => [{ ...SOURCE, id: only ?? 'x' }] });
    const out = await runImports(deps, 'awin-77');
    expect(out.map((o) => o.source)).toEqual(['awin-77']);
  });

  describe('photo measuring', () => {
    const IMG1 = 'https://img.example.com/1.jpg';
    const IMG2 = 'https://img.example.com/2.jpg';
    const saved = { url: IMG2, ratio: 1, bg: '#FFFFFF', kind: 'scene' as const };

    it('measures new photos, reuses saved ones and records what it did', async () => {
      const measured: string[] = [];
      const { deps, calls } = fakeDeps(FEED, {
        knownPhotoMeta: async () => new Map([[IMG2, saved]]),
        measurePhoto: async (url) => {
          measured.push(url);
          return { ratio: 1, bg: '#F8F8F8', kind: 'cutout', box: [0.1, 0.3, 0.8, 0.4] };
        },
      });
      await runImports(deps);
      expect(measured).toEqual([IMG1]);
      const byImg = Object.fromEntries(calls.upserted.map((r) => [r.image_urls[0], r.image_meta]));
      expect(byImg[IMG1]).toEqual([{ url: IMG1, ratio: 1, bg: '#F8F8F8', kind: 'cutout', box: [0.1, 0.3, 0.8, 0.4] }]);
      expect(byImg[IMG2]).toEqual([saved]);
      expect(calls.runs[0].report?.photos).toMatchObject({ measured: 1, reused: 1, failed: 0, cutouts: 1, trimmed: 1 });
    });

    it('leaves a photo it could not measure empty, so the app shows it whole', async () => {
      const { deps, calls } = fakeDeps(FEED, {
        knownPhotoMeta: async () => new Map(),
        measurePhoto: async () => null,
      });
      await runImports(deps);
      expect(calls.upserted.every((r) => r.image_meta?.[0] === null)).toBe(true);
      expect(calls.runs[0].report?.photos).toMatchObject({ measured: 0, failed: 2 });
      expect(calls.runs[0].status).toBe('ok');
    });

    it('changes nothing about photos before the image_meta column exists', async () => {
      const measurePhoto = jest.fn();
      const { deps, calls } = fakeDeps(FEED, { knownPhotoMeta: async () => null, measurePhoto });
      await runImports(deps);
      expect(measurePhoto).not.toHaveBeenCalled();
      expect(calls.upserted.every((r) => !('image_meta' in r))).toBe(true);
      expect(calls.runs[0].report?.photos?.skipped).toMatch(/image_meta/);
      expect(calls.runs[0].status).toBe('ok');
    });

    it('is off when no measuring tool is available', async () => {
      const { deps, calls } = fakeDeps(FEED);
      await runImports(deps);
      expect(calls.upserted.every((r) => !('image_meta' in r))).toBe(true);
      expect(calls.runs[0].report?.photos).toBeUndefined();
    });
  });
});
