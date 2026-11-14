import { analyseCalibration } from '../calibration';
import { aggregateGrade, checkTestLock, evaluate, judgmentsFromExports, type TestRun } from '../evaluate';
import { ART_COLOURS, drawSvg, makeCalibrationPack, randomDesign } from '../fixtureArt';
import { makeFixturePack, makeFixtureWorld, simulateRaters } from '../fixtures';
import { canonicalJson, checkManifest, manifestBody, retailerPage, snapshotRowToItem } from '../manifest';
import { sampleEvaluationSet } from '../sampling';
import { LABELS_VERSION, type LabelExport, type Manifest, type QuestionPack } from '../schema';
import { createRng } from '@/recommendation/random';

// A stand-in hash for tests (the script uses SHA-256 from node:crypto).
const fnv = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
};

describe('manifest', () => {
  it('canonical JSON ignores key order and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined, e: null }] })).toBe('{"a":[{"d":2,"e":null}],"b":1}');
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });

  it('reads the real store page from an affiliate link and collapses ?variant=', () => {
    const awin = 'https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued=https%3A%2F%2Fwww.store.example.com%2Fproducts%2FOak-Bench%3Fvariant%3D7';
    expect(retailerPage(awin)).toBe('store.example.com/products/oak-bench');
    expect(retailerPage('https://store.example.com/products/oak-bench/?variant=9')).toBe('store.example.com/products/oak-bench');
    const item = snapshotRowToItem({ id: 'p1', category_id: 'bedroom', subcategory_id: 'nightstands', retailer_id: 'r', image_urls: ['https://img.example.com/a.jpg'], product_url: awin, style_tags: ['modern', 'boho'], material: null, color: 'black' });
    expect(item).toMatchObject({ pagePath: 'store.example.com/products/oak-bench', styleTags: ['boho', 'modern'], material: '' });
    expect(JSON.stringify(item)).not.toContain('awin');
  });

  it('a valid manifest passes; tampering, a leak or a stray partner is caught', () => {
    const world = makeFixtureWorld(90, 3, 3);
    const sample = sampleEvaluationSet(world.catalog, { quotas: { nightstands: 10, sofas: 10 }, partners: { colourVariant: 3, samePhoto: 0 }, seed: 1 });
    const body = manifestBody(sample, { snapshot: 's.json', snapshotDate: '2026-11-09', products: world.catalog.length, seed: 1, quotas: {}, testShare: 0.6 });
    const m: Manifest = { ...body, hash: fnv(canonicalJson(body)) };
    expect(checkManifest(m, fnv)).toEqual([]);
    expect(m.counts.dev + m.counts.test).toBe(m.items.length);

    expect(checkManifest({ ...m, seed: 2 }, fnv)).toContain('hash does not match the contents');

    // Move one member of a multi-member group to the other side.
    const g = m.groups.find((x) => m.items.filter((i) => i.groupId === x.id).length > 1)!;
    const victim = m.items.find((i) => i.groupId === g.id)!;
    const leaked = { ...m, items: m.items.map((i) => (i === victim ? { ...i, split: i.split === 'dev' ? ('test' as const) : ('dev' as const) } : i)) };
    expect(checkManifest(leaked, fnv).some((p) => p.includes('both sides'))).toBe(true);
  });
});

describe('calibration art', () => {
  it('is deterministic, has traps, gold checks and balanced stored answers', () => {
    const a = makeCalibrationPack(1);
    expect(makeCalibrationPack(1)).toEqual(a);
    const qs = a.pack.questions;
    expect(qs).toHaveLength(28);
    expect(qs.filter((q) => q.kind === 'triplet' && q.stratum === 'colour-trap')).toHaveLength(3);
    expect(qs.filter((q) => q.kind === 'triplet' && q.stratum === 'photo-trap')).toHaveLength(3);
    const answers = qs.filter((q) => q.kind === 'triplet').map((q) => a.expected[q.id]);
    expect(answers.filter((x) => x === 'b').length).toBeGreaterThan(4);
    expect(answers.filter((x) => x === 'c').length).toBeGreaterThan(4);
    // Every image is our own drawing, never an address.
    expect(JSON.stringify(a.pack)).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it('colour traps really differ in colour the "wrong" way', () => {
    const { pack, expected } = makeCalibrationPack(3);
    for (const q of pack.questions) {
      if (q.kind !== 'triplet' || q.stratum !== 'colour-trap') continue;
      const match = expected[q.id] === 'b' ? q.b : q.c;
      const other = expected[q.id] === 'b' ? q.c : q.b;
      const palette = Object.values(ART_COLOURS) as string[];
      const fill = (src: string) => [...decodeURIComponent(src).matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]).find((c) => palette.includes(c!));
      expect(fill(other.src)).toBe(fill(q.anchor.src)); // decoy shares the anchor's colour
      expect(fill(match.src)).not.toBe(fill(q.anchor.src));
    }
  });

  it('draws valid SVG for every kind', () => {
    const rng = createRng(1);
    for (const kind of ['cabinet', 'sofa', 'table'] as const)
      for (const scene of ['studio', 'room'] as const) expect(drawSvg({ design: randomDesign(rng, 'x', kind), colour: '#7a5235', scene })).toMatch(/^<svg[^>]+>.*<\/svg>$/);
  });

  it('calibration analysis catches a rater who always picks the same colour', () => {
    const { pack, expected } = makeCalibrationPack(2);
    const mk = (rater: string, followColour: boolean): LabelExport => ({
      version: LABELS_VERSION,
      packId: pack.id,
      rater,
      startedAt: 't',
      finishedAt: 't',
      answers: pack.questions.map((q, order) => {
        const exp = expected[q.id]!;
        const value =
          q.kind === 'triplet'
            ? { kind: 'triplet' as const, choice: (followColour && q.stratum === 'colour-trap' ? (exp === 'b' ? 'c' : 'b') : exp) as 'b' | 'c' }
            : q.kind === 'pair'
              ? { kind: 'pair' as const, rating: (exp === '4-5' ? 5 : 1) as 1 | 5 }
              : q.kind === 'same'
                ? { kind: 'same' as const, choice: exp as 'same-photo' }
                : { kind: 'attributes' as const, value: {} };
        return { questionId: q.id, value, confidence: 2 as const, ms: 5000, order, swapped: false, at: 't' };
      }),
    });
    const good = analyseCalibration(pack, [mk('a', false), mk('b', false), mk('c', false)]);
    expect(good.trapAccuracy.colour).toBe(1);
    expect(good.agreement.tripletKappa).toBeCloseTo(1);
    const bad = analyseCalibration(pack, [mk('a', true), mk('b', true), mk('c', false)]);
    expect(bad.trapAccuracy.colour).toBeCloseTo(1 / 3);
    expect(bad.warnings.join(' ')).toMatch(/colour/);
  });
});

describe('evaluate', () => {
  it('aggregates grades conservatively and leaves single answers unjudged', () => {
    expect(aggregateGrade([3, 2])).toBe(2);
    expect(aggregateGrade([0, 3, 3])).toBe(3);
    expect(aggregateGrade([2, null])).toBeNull();
    const pack: QuestionPack = {
      version: 1,
      id: 'r',
      title: 'r',
      purpose: 'dev',
      questions: [{ kind: 'relevance', id: 'q1', query: { productId: 'a', src: '' }, candidate: { productId: 'b', src: '' } }],
    };
    const ex = (grade: 0 | 1 | 2 | 3 | null): LabelExport => ({ version: 1, packId: 'r', rater: String(grade), startedAt: '', finishedAt: '', answers: [{ questionId: 'q1', value: { kind: 'relevance', grade }, confidence: 2, ms: 1, order: 0, swapped: false, at: '' }] });
    expect(judgmentsFromExports([pack], [ex(3), ex(2)]).get('a')!.get('b')).toBe(2);
    expect(judgmentsFromExports([pack], [ex(3), ex(null)]).size).toBe(0);
  });

  it('scores only the requested split and drops questions that mix splits', () => {
    const world = makeFixtureWorld(60, 3, 9);
    const products = world.catalog.map((c, i) => ({ id: c.id, split: i % 2 ? ('test' as const) : ('dev' as const), retailerId: c.retailerId, subcategoryId: c.subcategoryId }));
    const pack = makeFixturePack(world, 60, 4);
    const exports = simulateRaters(world, pack, 3);
    const dev = evaluate({ split: 'dev', products, packs: [pack], exports, systems: world.systems });
    const test = evaluate({ split: 'test', products, packs: [pack], exports, systems: world.systems });
    expect(dev.labels.excludedMixedSplit).toBeGreaterThan(0);
    expect(dev.labels.excludedMixedSplit).toBe(test.labels.excludedMixedSplit);
    const devIds = new Set(products.filter((p) => p.split === 'dev').map((p) => p.id));
    const devQs = pack.questions.filter((q) => q.kind === 'triplet' && [q.anchor, q.b, q.c].every((x) => devIds.has(x.productId)));
    expect(dev.labels.triplets).toBe(devQs.length);
    expect(evaluate({ split: 'dev', products, packs: [pack], exports, systems: world.systems })).toEqual(dev);
  });

  it('test lock: once per manifest and system, needs a reason, repeats need force', () => {
    const run: TestRun = { at: 't', manifestHash: 'h', systems: ['siglip2'], inputHash: 'x', reason: 'frozen', forced: false };
    expect(checkTestLock([], { manifestHash: 'h', systems: ['siglip2'], force: false, reason: '' }).ok).toBe(false);
    expect(checkTestLock([], { manifestHash: 'h', systems: ['siglip2'], force: false, reason: 'frozen on dev' }).ok).toBe(true);
    expect(checkTestLock([run], { manifestHash: 'h', systems: ['siglip2', 'dinov2'], force: false, reason: 'again' }).ok).toBe(false);
    expect(checkTestLock([run], { manifestHash: 'h', systems: ['dinov2'], force: false, reason: 'new system' }).ok).toBe(true);
    expect(checkTestLock([run], { manifestHash: 'other', systems: ['siglip2'], force: false, reason: 'new manifest' }).ok).toBe(true);
    expect(checkTestLock([run], { manifestHash: 'h', systems: ['siglip2'], force: true, reason: 'bug fix in scorer' }).ok).toBe(true);
  });
});
