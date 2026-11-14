import { aggregateGrade, checkTestLock, evaluate, judgmentsFromExports, type TestRun } from '../evaluate';
import { ART_COLOURS, drawSvg, makeCalibrationPack, randomDesign } from '../fixtureArt';
import { makeFixturePack, makeFixtureWorld, simulateRaters } from '../fixtures';
import { canonicalJson, checkManifest, manifestBody, pageKey, productNameKey, retailerPage, snapshotRowToItem } from '../manifest';
import { sampleEvaluationSet } from '../sampling';
import { LABELS_VERSION, validateExport, type LabelExport, type Manifest, type QuestionPack } from '../schema';
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

  it('productNameKey finds one design family under colour, size and count wording', () => {
    const k = (t: string) => productNameKey(t, ['alder']);
    expect(productNameKey('Cas TV Cabinet with 2-Door, Set of 2 in Grey Alder')).toBe('cas tv cabinet door alder');
    expect(productNameKey('Cas TV Cabinet with 3-Door, Set of 2 in White Alder')).toBe('cas tv cabinet door alder');
    expect(productNameKey('Stria Round Coffee Tables in Dark Grey Alder')).toBe('stria round coffee table alder');
    expect(k('Stria Coffee Table in Dark Grey Alder')).toBe('stria coffee table');
    expect(productNameKey('Black Sofa')).toBe(''); // too generic to mean the same design
    // The real Stria duplicate differs in name ("Round … Tables") but its pages match once singularised.
    expect(pageKey('sicotas.com/products/stria-round-coffee-tables-living-room-mid-century-fluted-center-table')).toBe(
      pageKey('sicotas.com/products/stria-round-coffee-table-living-room-mid-century-fluted-center-table'),
    );
    expect(pageKey('a.example.com/products/oak-bed')).toBe('');
    expect(productNameKey('Oak 47 inch Nightstand (Set of 2)')).toBe('');
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

describe('calibration art (v2)', () => {
  const palette = Object.values(ART_COLOURS) as string[];
  const fill = (src: string) => [...decodeURIComponent(src).matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]).find((c) => palette.includes(c!));
  const matchOf = (q: { b: { src: string }; c: { src: string } }, note: string) => (note.endsWith('match=b') ? [q.b, q.c] : [q.c, q.b]);

  it('is deterministic and covers every contrast with about 30 judgments', () => {
    const a = makeCalibrationPack(1);
    expect(makeCalibrationPack(1)).toEqual(a);
    const qs = a.pack.questions;
    const judgments = qs.reduce((n, q) => n + (q.kind === 'triplet' || q.kind === 'pair' ? q.ask.length : 1), 0);
    expect(judgments).toBe(30);
    const count = (st: string) => qs.filter((q) => (q.kind === 'triplet' || q.kind === 'pair') && q.stratum === st).length;
    expect(count('shape-vs-colour')).toBe(3);
    expect(count('finish-only')).toBe(2);
    expect(count('photo-style')).toBe(2);
    expect(count('near-identical')).toBe(1);
    expect(count('gold')).toBe(2);
    expect(['same-shape-diff-colour', 'same-colour-diff-shape', 'same-design-diff-finish'].map(count)).toEqual([1, 1, 1]);
    const positions = qs.filter((q) => q.kind === 'triplet').map((q) => a.expected[q.id]);
    expect(positions.filter((x) => x!.endsWith('match=b')).length).toBeGreaterThan(2);
    expect(positions.filter((x) => x!.endsWith('match=c')).length).toBeGreaterThan(2);
    expect(qs.map((q) => q.id)).toEqual(qs.map((_, i) => `c${String(i + 1).padStart(2, '0')}`));
    // Every image is our own drawing, never an address.
    expect(JSON.stringify(a.pack)).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    // Answers validate against the pack shape (one value per asked dimension).
    expect(validateExport({ version: LABELS_VERSION, packId: a.pack.id, rater: 'x', startedAt: '', finishedAt: '', answers: [] }, a.pack)).toEqual([]);
  });

  it('shape-vs-colour: the shape match has another colour, the decoy has the anchor colour', () => {
    for (const seed of [1, 2, 3]) {
      const { pack, expected } = makeCalibrationPack(seed);
      for (const q of pack.questions) {
        if (q.kind !== 'triplet' || q.stratum !== 'shape-vs-colour') continue;
        const [match, decoy] = matchOf(q, expected[q.id]!);
        expect(fill(decoy!.src)).toBe(fill(q.anchor.src));
        expect(fill(match!.src)).not.toBe(fill(q.anchor.src));
        expect(q.gold).toEqual({ structure: expected[q.id]!.slice(-1) });
      }
    }
  });

  it('finish-only: all three share colour and design kind; only the decoy changes finish', () => {
    const { pack, expected } = makeCalibrationPack(1);
    const finishOf = (src: string) => (decodeURIComponent(src).includes('opacity="0.38"') ? 'gloss' : decodeURIComponent(src).includes('stroke-width="1.1"') ? 'woodgrain' : 'matte');
    for (const q of pack.questions) {
      if (q.kind !== 'triplet' || q.stratum !== 'finish-only') continue;
      const [match, decoy] = matchOf(q, expected[q.id]!);
      expect(new Set([fill(q.anchor.src), fill(match!.src), fill(decoy!.src)]).size).toBe(1);
      expect(finishOf(match!.src)).toBe(finishOf(q.anchor.src));
      expect(finishOf(decoy!.src)).not.toBe(finishOf(q.anchor.src));
      expect(q.gold).toEqual({ aesthetic: expected[q.id]!.slice(-1) });
    }
  });

  it('draws valid SVG for every kind, scene and finish; a finish never changes the outline', () => {
    const rng = createRng(1);
    for (const kind of ['cabinet', 'sofa', 'table'] as const) {
      const d = randomDesign(rng, 'x', kind);
      for (const scene of ['studio', 'room'] as const)
        for (const finish of ['matte', 'gloss', 'woodgrain'] as const) {
          const svg = drawSvg({ design: d, colour: '#7a5235', scene, finish });
          expect(svg).toMatch(/^<svg[^>]+>.*<\/svg>$/);
          if (finish !== 'matte') expect(svg.startsWith(drawSvg({ design: d, colour: '#7a5235', scene }).replace('</svg>', ''))).toBe(true);
        }
    }
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
    expect(dev.labels.triplets).toEqual({ structure: devQs.length, aesthetic: devQs.length });
    expect(evaluate({ split: 'dev', products, packs: [pack], exports, systems: world.systems })).toEqual(dev);
  });

  it('scores structure and overall look separately; where they disagree, each model wins its own dimension', () => {
    const world = makeFixtureWorld(90, 3, 12);
    const products = world.catalog.map((c) => ({ id: c.id, split: 'dev' as const, retailerId: c.retailerId, subcategoryId: c.subcategoryId }));
    const pack = makeFixturePack(world, 300, 6);
    const r = evaluate({ split: 'dev', products, packs: [pack], exports: simulateRaters(world, pack, 3), systems: world.systems });
    expect(r.labels.divergentTriplets).toBeGreaterThan(20);
    const design = r.systems.design!;
    const colour = r.systems['colour-aware']!;
    expect(design.divergent.structure.accuracy.mean).toBeGreaterThan(colour.divergent.structure.accuracy.mean + 0.2);
    expect(colour.divergent.aesthetic.accuracy.mean).toBeGreaterThan(design.divergent.aesthetic.accuracy.mean + 0.2);
    // On divergent items one embedding can't be right on both: accuracies sum to ~1.
    expect(design.divergent.structure.accuracy.mean + design.divergent.aesthetic.accuracy.mean).toBeCloseTo(1, 1);
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
