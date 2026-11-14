/**
 * Pooled relevance judgments (the standard method for evaluating retrieval when the full
 * candidate universe can't be judged).
 *
 * For each query, people judge the UNION of:
 *   - the top `depth` results of EVERY system being compared (equal depth for all, so no system
 *     sets the questions), including text-only baselines;
 *   - `randomPerQuery` random candidates (to estimate how many relevant items pools miss);
 *   - every other sampled member of the query's related group (same design / variants).
 * Candidates are drawn only from the query's own split, so test judgments never touch dev.
 *
 * A system added later must be pooled too (its top `depth` judged) before its numbers count;
 * the evaluator reports judged@k so this can't be skipped silently.
 */
import { createRng, hashSeed } from '@/recommendation/random';
import type { Split } from './schema';

export interface PoolInput {
  /** Queries and the candidate universe, each with its split. */
  products: readonly { id: string; split: Split; subcategoryId: string }[];
  /** System name → ranked candidate ids for a query (from that query's universe). */
  systems: ReadonlyMap<string, (query: string, universe: readonly string[]) => readonly string[]>;
  groupOf: ReadonlyMap<string, string>;
  depth: number;
  randomPerQuery: number;
  seed: number;
  /** Restrict candidates to the query's product type (default true; cross-type pools are a separate study). */
  sameType?: boolean;
  /** Which queries to pool (default: every product). */
  queries?: readonly string[];
}

export interface PoolEntry {
  query: string;
  candidate: string;
  split: Split;
  /** What put it in the pool: system names, 'random', 'same-group'. */
  sources: string[];
}

export function buildPool(input: PoolInput): PoolEntry[] {
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const sameType = input.sameType ?? true;
  const queries = [...(input.queries ?? input.products.map((p) => p.id))].sort();
  const out: PoolEntry[] = [];
  for (const q of queries) {
    const qp = byId.get(q);
    if (!qp) continue;
    const universe = input.products
      .filter((p) => p.id !== q && p.split === qp.split && (!sameType || p.subcategoryId === qp.subcategoryId))
      .map((p) => p.id)
      .sort();
    const allowed = new Set(universe);
    const sources = new Map<string, Set<string>>();
    const add = (id: string, why: string) => {
      if (!allowed.has(id)) return; // never across splits or outside the universe
      if (!sources.has(id)) sources.set(id, new Set());
      sources.get(id)!.add(why);
    };
    for (const [name, rank] of [...input.systems].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      for (const id of rank(q, universe).slice(0, input.depth)) add(id, name);
    }
    const rng = createRng(hashSeed(`pool:${input.seed}:${q}`));
    const shuffled = universe.map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r);
    for (const { id } of shuffled.slice(0, input.randomPerQuery)) add(id, 'random');
    const g = input.groupOf.get(q);
    if (g) for (const id of universe) if (input.groupOf.get(id) === g) add(id, 'same-group');
    for (const [candidate, why] of [...sources].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      out.push({ query: q, candidate, split: qp.split, sources: [...why].sort() });
    }
  }
  return out;
}

/** How many pooled pairs each source contributed, and how many only that source found. */
export function poolContribution(pool: readonly PoolEntry[]): Record<string, { total: number; unique: number }> {
  const out: Record<string, { total: number; unique: number }> = {};
  for (const e of pool) {
    for (const s of e.sources) {
      out[s] ??= { total: 0, unique: 0 };
      out[s].total++;
      if (e.sources.length === 1) out[s].unique++;
    }
  }
  return out;
}
