/**
 * Synthetic fixtures for the visual evaluation (Stage 1). Entirely fictional: example.com
 * addresses, no real products or photos. Used by the unit tests and by
 * `npm run vision:evaluate -- --fixture` to exercise the whole pipeline before any real image is
 * touched.
 *
 * Each fake product has a hidden design vector; colour variants share it; each store has its own
 * "photo style" offset. Simulated structure judgments follow the design; simulated overall-look
 * judgments follow the design AND the colour. Four fake systems:
 *   - 'design'       sees the design only (what a structure-only model looks like)
 *   - 'colour-aware' sees the design plus the colour (what an overall-look model looks like)
 *   - 'store-biased' sees mostly the photo style (what a background/store shortcut looks like)
 *   - 'text'         sees only noisy tags (a text-only baseline)
 * Simulated raters judge by design with some noise and occasional "can't tell".
 */
import { createRng, hashSeed, type Rng } from '@/recommendation/random';
import type { CatalogItem, Question, QuestionPack, LabelExport, Answer, Stratum, Dimension, TripletChoice, Rating } from './schema';
import { DIMENSIONS, LABELS_VERSION } from './schema';

const BOTH = DIMENSIONS;

const DIM = 8;

function gaussian(rng: Rng): number {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export interface FixtureWorld {
  catalog: CatalogItem[];
  design: Map<string, number[]>;
  store: Map<string, string>;
  systems: Map<string, Map<string, number[]>>;
}

/** `designs` designs, 1–3 colour variants each, across `stores` stores with distinct photo styles. */
export function makeFixtureWorld(designs = 60, stores = 3, seed = 7): FixtureWorld {
  const rng = createRng(hashSeed(`vision-fixture:${seed}`));
  const storeStyle = Array.from({ length: stores }, () => Array.from({ length: DIM }, () => gaussian(rng)));
  const types = ['nightstands', 'sofas', 'coffee-tables'];
  const colours = ['walnut', 'black', 'white', 'oatmeal'];
  const catalog: CatalogItem[] = [];
  const design = new Map<string, number[]>();
  const store = new Map<string, string>();
  for (let d = 0; d < designs; d++) {
    const dv = Array.from({ length: DIM }, () => gaussian(rng));
    const s = Math.floor(rng() * stores);
    const type = types[d % types.length]!;
    const variants = 1 + Math.floor(rng() * 3);
    for (let v = 0; v < variants; v++) {
      const id = `fx-${String(d).padStart(3, '0')}-${v}`;
      catalog.push({
        id,
        retailerId: `fx-store-${s}`,
        subcategoryId: type,
        categoryId: 'living-room',
        styleTags: [rng() < 0.3 ? 'modern' : `style-${d % 6}`],
        material: rng() < 0.2 ? '' : `material-${d % 4}`,
        color: colours[(d + v) % colours.length]!,
        photoUrl: `https://img.example.com/${id}.jpg`,
        pagePath: `/products/design-${d}`,
      });
      design.set(id, dv.map((x) => x + 0.05 * gaussian(rng)));
      store.set(id, `fx-store-${s}`);
    }
  }
  const systems = new Map<string, Map<string, number[]>>();
  const sys = (name: string, f: (id: string) => number[]) => systems.set(name, new Map(catalog.map((c) => [c.id, f(c.id)])));
  const styleOf = (id: string) => storeStyle[Number(store.get(id)!.split('-').pop())]!;
  sys('design', (id) => design.get(id)!.map((x) => x + 0.3 * gaussian(rng)));
  const colourOf = new Map(catalog.map((c) => [c.id, c.color]));
  sys('colour-aware', (id) => [...design.get(id)!.map((x) => x + 0.3 * gaussian(rng)), ...colours.map((c) => (colourOf.get(id) === c ? 2.2 : 0))]);
  sys('store-biased', (id) => design.get(id)!.map((x, i) => 0.35 * x + 1.6 * styleOf(id)[i]! + 0.3 * gaussian(rng)));
  sys('text', (id) => {
    const c = catalog.find((x) => x.id === id)!;
    const h = (s: string) => Array.from({ length: DIM }, (_, i) => (hashSeed(`${s}:${i}`) % 1000) / 500 - 1);
    const t = h(c.styleTags[0]!);
    const m = h(c.material || 'none');
    return t.map((x, i) => x + 0.5 * m[i]! + 0.2 * gaussian(rng));
  });
  return { catalog, design, store, systems };
}

/** Overall-look similarity a simulated rater perceives: design plus colour. */
function aestheticSim(world: FixtureWorld, a: string, b: string): number {
  const colour = (id: string) => world.catalog.find((c) => c.id === id)!.color;
  return 0.6 * cos(world.design.get(a)!, world.design.get(b)!) + 0.4 * (colour(a) === colour(b) ? 1 : -0.3);
}

const cos = (a: number[], b: number[]) => {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return d / Math.sqrt(na * nb);
};

/** Triplets and pairs built from metadata and randomness only (never from a system's output). */
export function makeFixturePack(world: FixtureWorld, n = 40, seed = 3): QuestionPack {
  const rng = createRng(hashSeed(`vision-fixture-pack:${seed}`));
  const ids = world.catalog.map((c) => c.id);
  const img = (id: string) => ({ productId: id, src: `https://img.example.com/${id}.jpg` });
  const questions: Question[] = [];
  for (let i = 0; i < n; i++) {
    const [a, b, c] = [0, 0, 0].map(() => ids[Math.floor(rng() * ids.length)]!);
    if (a === b || a === c || b === c) continue;
    questions.push({ kind: 'triplet', id: `t${i}`, anchor: img(a), b: img(b), c: img(c), stratum: 'random' as Stratum, ask: BOTH });
  }
  for (let i = 0; i < n / 2; i++) {
    const [a, b] = [0, 0].map(() => ids[Math.floor(rng() * ids.length)]!);
    if (a === b) continue;
    questions.push({ kind: 'pair', id: `p${i}`, a: img(a), b: img(b), stratum: 'random', ask: BOTH });
  }
  // Same-thing checks: colour variants (same page) and random pairs of the same type.
  const byPage = new Map<string, string[]>();
  for (const c of world.catalog) byPage.set(c.pagePath, [...(byPage.get(c.pagePath) ?? []), c.id]);
  const families = [...byPage.values()].filter((m) => m.length > 1);
  for (let i = 0; i < n / 4; i++) {
    const fam = families.length && rng() < 0.5 ? families[Math.floor(rng() * families.length)]! : null;
    const [a, b] = fam ? [fam[0]!, fam[1]!] : [0, 0].map(() => ids[Math.floor(rng() * ids.length)]!);
    if (a === b) continue;
    questions.push({ kind: 'same', id: `s${i}`, a: img(a!), b: img(b!), stratum: fam ? 'same-design-diff-colour' : 'random' });
  }
  return { version: LABELS_VERSION, id: `fixture-${seed}`, title: 'Synthetic fixture pack', purpose: 'fixture', questions };
}

/** Simulated raters who judge by design, with noise; `cantTell` share answer "can't tell". */
export function simulateRaters(world: FixtureWorld, pack: QuestionPack, raters = 3, noise = 0.15, cantTell = 0.05): LabelExport[] {
  return Array.from({ length: raters }, (_, r) => {
    const rng = createRng(hashSeed(`vision-rater:${r}:${pack.id}`));
    const answers: Answer[] = pack.questions.map((q, order) => {
      const base = { confidence: 2 as const, ms: 2000 + Math.floor(rng() * 6000), order, swapped: rng() < 0.5, at: '2026-11-14T00:00:00Z' };
      const sim = (d: Dimension, x: string, y: string) => (d === 'structure' ? cos(world.design.get(x)!, world.design.get(y)!) : aestheticSim(world, x, y));
      if (q.kind === 'triplet') {
        const value: { kind: 'triplet' } & Partial<Record<Dimension, TripletChoice>> = { kind: 'triplet' };
        for (const d of q.ask) {
          const sb = sim(d, q.anchor.productId, q.b.productId) + noise * gaussian(rng);
          const sc = sim(d, q.anchor.productId, q.c.productId) + noise * gaussian(rng);
          value[d] = rng() < cantTell ? 'cant-tell' : sb >= sc ? 'b' : 'c';
        }
        return { ...base, questionId: q.id, value };
      }
      if (q.kind === 'pair') {
        const value: { kind: 'pair' } & Partial<Record<Dimension, Rating>> = { kind: 'pair' };
        for (const d of q.ask) value[d] = Math.max(1, Math.min(5, Math.round(3 + 2.2 * (sim(d, q.a.productId, q.b.productId) + noise * gaussian(rng))))) as Rating;
        return { ...base, questionId: q.id, value };
      }
      if (q.kind === 'same') {
        const s = cos(world.design.get(q.a.productId)!, world.design.get(q.b.productId)!) + (noise / 3) * gaussian(rng);
        const choice = rng() < cantTell ? 'cant-tell' : s > 0.97 ? 'same-design-diff-colour' : 'different';
        return { ...base, questionId: q.id, value: { kind: 'same', choice } };
      }
      return { ...base, questionId: q.id, value: { kind: 'relevance', grade: null } };
    });
    return { version: LABELS_VERSION, packId: pack.id, rater: `sim-${r}`, startedAt: '2026-11-14T00:00:00Z', finishedAt: '2026-11-14T00:30:00Z', answers };
  });
}

/**
 * Graded relevance a simulated rater panel would give (0–3), for pooled retrieval tests.
 * Relevance is judged on the overall look ("would appeal to the same shopper").
 */
export function simulatedGrade(world: FixtureWorld, q: string, c: string): number {
  const s = aestheticSim(world, q, c);
  return s > 0.85 ? 3 : s > 0.5 ? 2 : s > 0.15 ? 1 : 0;
}
