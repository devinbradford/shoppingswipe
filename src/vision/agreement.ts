/**
 * Human-rater agreement. Labels are only as good as raters' agreement, so every metric is reported
 * next to how much people agreed on the same questions.
 *
 * - majority(): the label for one question, or 'ambiguous' when there is no clear majority or
 *   too many "can't tell" answers. Ambiguous items are excluded from accuracy and reported apart.
 * - fleissKappa(): agreement on categorical answers beyond chance (raters may skip items).
 * - krippendorffAlpha(): nominal, ordinal or interval data, any number of raters, missing allowed.
 * Pure and deterministic.
 */

export interface Majority<T> {
  label: T | 'ambiguous';
  /** Share of (non-"can't tell") votes for the winning label. */
  agreement: number;
  votes: number;
  cantTell: number;
}

/**
 * The majority answer. Needs a strict majority (> `threshold`) of the answers that weren't
 * "can't tell", at least `minVotes` such answers, and "can't tell" from no more than half of raters.
 */
export function majority<T extends string | number>(
  answers: readonly (T | 'cant-tell' | null)[],
  { threshold = 0.5, minVotes = 2 }: { threshold?: number; minVotes?: number } = {},
): Majority<T> {
  const real = answers.filter((a): a is T => a !== 'cant-tell' && a !== null);
  const cantTell = answers.length - real.length;
  const counts = new Map<T, number>();
  for (const a of real) counts.set(a, (counts.get(a) ?? 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || (String(a[0]) < String(b[0]) ? -1 : 1));
  const top = sorted[0];
  const second = sorted[1];
  const agreement = top ? top[1] / real.length : 0;
  const ok =
    top !== undefined &&
    real.length >= minVotes &&
    agreement > threshold &&
    (!second || second[1] < top[1]) &&
    cantTell <= answers.length / 2;
  return { label: ok ? top![0] : 'ambiguous', agreement, votes: real.length, cantTell };
}

/**
 * Fleiss' kappa for categorical ratings. `items` = per question, the categories raters chose
 * (each rater at most once; items with fewer than 2 ratings are ignored).
 */
export function fleissKappa(items: readonly (readonly string[])[]): number {
  const rated = items.filter((r) => r.length >= 2);
  if (rated.length === 0) return NaN;
  const cats = [...new Set(rated.flat())].sort();
  let pBar = 0;
  const pj = new Map(cats.map((c) => [c, 0]));
  let total = 0;
  for (const r of rated) {
    const n = r.length;
    const counts = new Map<string, number>();
    for (const c of r) counts.set(c, (counts.get(c) ?? 0) + 1);
    let s = 0;
    for (const v of counts.values()) s += v * (v - 1);
    pBar += s / (n * (n - 1));
    for (const [c, v] of counts) pj.set(c, pj.get(c)! + v);
    total += n;
  }
  pBar /= rated.length;
  let pe = 0;
  for (const v of pj.values()) pe += (v / total) ** 2;
  return pe === 1 ? 1 : (pBar - pe) / (1 - pe);
}

export type Level = 'nominal' | 'ordinal' | 'interval';

/**
 * Krippendorff's alpha. `units` = per question, the values raters gave (null/undefined = missing).
 * Values are numbers for ordinal/interval, anything comparable for nominal.
 */
export function krippendorffAlpha(units: readonly (readonly (number | string | null | undefined)[])[], level: Level): number {
  // Coincidence matrix over pairable values.
  const values: (number | string)[] = [];
  const pairable = units.map((u) => u.filter((v): v is number | string => v !== null && v !== undefined)).filter((u) => u.length >= 2);
  for (const u of pairable) values.push(...u);
  if (pairable.length === 0) return NaN;
  const cats = [...new Set(values)].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1));
  const idx = new Map(cats.map((c, i) => [c, i]));
  const k = cats.length;
  const o: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (const u of pairable) {
    const m = u.length;
    for (let i = 0; i < m; i++)
      for (let j = 0; j < m; j++) if (i !== j) o[idx.get(u[i]!)!]![idx.get(u[j]!)!]! += 1 / (m - 1);
  }
  const nc = o.map((row) => row.reduce((a, b) => a + b, 0));
  const n = nc.reduce((a, b) => a + b, 0);
  if (k === 1) return 1;

  const delta = (c: number, d: number): number => {
    if (level === 'nominal') return c === d ? 0 : 1;
    if (level === 'interval') return ((cats[c] as number) - (cats[d] as number)) ** 2;
    // ordinal: (sum of marginals between c and d, minus half of each end)²
    const lo = Math.min(c, d);
    const hi = Math.max(c, d);
    let s = 0;
    for (let g = lo; g <= hi; g++) s += nc[g]!;
    return (s - (nc[lo]! + nc[hi]!) / 2) ** 2;
  };
  let dObs = 0;
  let dExp = 0;
  for (let c = 0; c < k; c++)
    for (let d = 0; d < k; d++) {
      const dd = delta(c, d);
      dObs += o[c]![d]! * dd;
      dExp += nc[c]! * nc[d]! * dd;
    }
  dObs /= n;
  dExp /= n * (n - 1);
  return dExp === 0 ? 1 : 1 - dObs / dExp;
}
