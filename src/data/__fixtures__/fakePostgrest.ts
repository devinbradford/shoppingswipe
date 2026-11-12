/**
 * A small stand-in for Supabase's PostgREST client, for repository tests. It behaves like the
 * real thing where it matters for catalog coverage: every response is capped at 1,000 rows
 * (Supabase's default), inactive products are invisible (the database's read rule), and any
 * request can be made to fail. It also records each request and its approximate URL length.
 * Fictional data only.
 */
import { SUBCATEGORIES } from '../sample/catalog';
import type { ProductRow } from '@/lib/rows';

export const SERVER_MAX_ROWS = 1000;

export type FakeRow = ProductRow & { is_active: boolean };

/** `n` fake products spread across every room and type, three stores and a range of prices. */
export function fakeCatalog(n: number): FakeRow[] {
  return Array.from({ length: n }, (_, i) => {
    const sub = SUBCATEGORIES[i % SUBCATEGORIES.length]!;
    return {
      id: `p${String(i).padStart(6, '0')}`,
      category_id: sub.categoryId,
      subcategory_id: sub.id,
      retailer_id: `r${i % 3}`,
      title: i % 10 === 0 ? `Oak piece ${i}` : `Piece ${i}`,
      brand: 'Example Brand',
      description: '',
      price_cents: ((i * 37) % 900) * 100 + 1000,
      currency: 'USD',
      image_urls: [`https://img.example.com/${i}.jpg`],
      product_url: `https://shop.example.com/${i}`,
      style_tags: ['modern'],
      material: 'wood',
      color: 'brown',
      created_at: '2026-11-01T00:00:00Z',
      is_active: true,
    };
  });
}

interface Request {
  columns: string;
  /** Rough length of the query string the real client would send. */
  urlLength: number;
  rows: number;
}

export function fakeDb(catalog: FakeRow[], opts: { failOnRequest?: number } = {}) {
  const requests: Request[] = [];
  const from = () => {
    let columns = '';
    let urlLength = 0;
    let limit = Infinity;
    const preds: ((r: FakeRow) => boolean)[] = [(r) => r.is_active];
    let orderBy: string | null = null;
    const q = {
      select(c: string) {
        columns = c;
        urlLength += c.length + 8;
        return q;
      },
      eq(k: keyof FakeRow, v: unknown) {
        urlLength += String(k).length + String(v).length + 5;
        preds.push((r) => r[k] === v);
        return q;
      },
      in(k: keyof FakeRow, vs: readonly unknown[]) {
        urlLength += String(k).length + vs.reduce<number>((n, v) => n + String(v).length + 1, 0) + 7;
        const set = new Set(vs);
        preds.push((r) => set.has(r[k]));
        return q;
      },
      gt(k: keyof FakeRow, v: string) {
        urlLength += String(k).length + v.length + 5;
        preds.push((r) => String(r[k]) > v);
        return q;
      },
      gte(k: keyof FakeRow, v: number) {
        preds.push((r) => (r[k] as number) >= v);
        return q;
      },
      lte(k: keyof FakeRow, v: number) {
        preds.push((r) => (r[k] as number) <= v);
        return q;
      },
      or(expr: string) {
        // Enough for tests: "title.ilike.*word*,…" → title contains word.
        const word = /title\.ilike\.\*([^*]+)\*/.exec(expr)?.[1]?.toLowerCase() ?? '';
        preds.push((r) => r.title.toLowerCase().includes(word));
        return q;
      },
      order(k: string) {
        orderBy = k;
        return q;
      },
      limit(n: number) {
        limit = n;
        return q;
      },
      maybeSingle() {
        return q;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        requests.push({ columns, urlLength, rows: 0 });
        if (opts.failOnRequest === requests.length) {
          return Promise.resolve({ data: null, error: { message: 'network down' } }).then(resolve, reject);
        }
        let rows = catalog.filter((r) => preds.every((p) => p(r)));
        if (orderBy === 'id') rows = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
        rows = rows.slice(0, Math.min(limit, SERVER_MAX_ROWS));
        requests.at(-1)!.rows = rows.length;
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return q;
  };
  return { db: { from } as never, requests };
}
