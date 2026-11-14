/**
 * Non-visual comparison systems for the visual-model evaluation (Stage 2). Each turns catalog
 * METADATA into vectors that the evaluator scores exactly like an image model's embeddings, so a
 * visual model has to beat what CureAvo already knows from words. Pure and deterministic.
 *
 *   tags          the engine's own catalog tags: style tags + material + product type
 *   colour-aware  tags + the catalog colour (a colour-matching shortcut)
 *   text          words of the title and description (hashed TF-IDF)
 *   random        seeded random vectors (the floor)
 */
import { createRng, hashSeed } from '@/recommendation/random';

export interface BaselineProduct {
  id: string;
  subcategoryId: string;
  styleTags: readonly string[];
  material: string;
  color: string;
  title?: string;
  description?: string;
}

export type Vectors = Map<string, number[]>;

const normalise = (v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n > 0 ? v.map((x) => x / n) : v;
};

function oneHot(values: readonly string[], vocab: Map<string, number>, weight = 1): number[] {
  const v = new Array<number>(vocab.size).fill(0);
  for (const x of values) {
    const i = vocab.get(x);
    if (i !== undefined) v[i] = weight;
  }
  return v;
}

function vocabulary(values: Iterable<string>): Map<string, number> {
  return new Map([...new Set(values)].filter(Boolean).sort().map((x, i) => [x, i]));
}

/** Catalog tags: style tags, material and product type. */
export function tagVectors(products: readonly BaselineProduct[]): Vectors {
  const vocab = vocabulary(products.flatMap((p) => [...p.styleTags.map((t) => `style:${t}`), p.material && `material:${p.material.toLowerCase()}`, `type:${p.subcategoryId}`]));
  return new Map(products.map((p) => [p.id, normalise(oneHot([...p.styleTags.map((t) => `style:${t}`), `material:${p.material.toLowerCase()}`, `type:${p.subcategoryId}`], vocab))]));
}

/** Tags plus the catalog colour, weighted so colour matters as much as everything else together. */
export function colourAwareVectors(products: readonly BaselineProduct[], colourWeight = 1.5): Vectors {
  const tags = tagVectors(products);
  const colours = vocabulary(products.map((p) => p.color.toLowerCase()));
  return new Map(products.map((p) => [p.id, normalise([...tags.get(p.id)!, ...oneHot([p.color.toLowerCase()], colours, colourWeight)])]));
}

const STOP = new Set('a an and are as at be by for from has in is it its of on or that the this to with your you our we will can not no all more most very into out up so than then them they these those over under about each per'.split(' '));

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** Hashed TF-IDF over title + description words (title words counted twice), `dim` buckets. */
export function textVectors(products: readonly BaselineProduct[], dim = 512): Vectors {
  const docs = products.map((p) => [...tokens(p.title ?? ''), ...tokens(p.title ?? ''), ...tokens(p.description ?? '')]);
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const n = products.length;
  return new Map(
    products.map((p, i) => {
      const v = new Array<number>(dim).fill(0);
      const tf = new Map<string, number>();
      for (const w of docs[i]!) tf.set(w, (tf.get(w) ?? 0) + 1);
      for (const [w, c] of tf) {
        const h = hashSeed(`tok:${w}`);
        v[h % dim]! += (h & 0x80000000 ? -1 : 1) * (1 + Math.log(c)) * Math.log((1 + n) / (1 + df.get(w)!));
      }
      return [p.id, normalise(v)];
    }),
  );
}

/** Seeded random unit vectors (the floor every system must beat). */
export function randomVectors(ids: readonly string[], dim = 64, seed = 1): Vectors {
  return new Map(
    ids.map((id) => {
      const rng = createRng(hashSeed(`random-baseline:${seed}:${id}`));
      return [id, normalise(Array.from({ length: dim }, () => rng() * 2 - 1))];
    }),
  );
}

export const BASELINES = ['tags', 'colour-aware', 'text', 'random'] as const;

export function allBaselines(products: readonly BaselineProduct[], seed = 1): Map<(typeof BASELINES)[number], Vectors> {
  return new Map<(typeof BASELINES)[number], Vectors>([
    ['tags', tagVectors(products)],
    ['colour-aware', colourAwareVectors(products)],
    ['text', textVectors(products)],
    ['random', randomVectors(products.map((p) => p.id), 64, seed)],
  ]);
}
