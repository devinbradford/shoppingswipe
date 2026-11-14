/**
 * Real-photo timing pilot pack (Stage 2): a small set of screens built from DEV products of the
 * manifest, by catalog metadata only (no image is opened to build it). It measures how long real
 * catalog photos take to judge before the full round is sized. Showing it to raters is permission
 * P1, so the rater copy is only produced once that approval is recorded (see the script).
 *
 * Photos are referenced at a bounded resolution through the store's own image CDN (`width=512`).
 */
import { createRng, hashSeed } from '@/recommendation/random';
import { questionSplit } from './grouping';
import { DIMENSIONS, LABELS_VERSION, type ManifestItem, type Question, type QuestionPack, type ShownImage, type Stratum } from './schema';

export const PILOT_MAX_PX = 512;

/** The photo address at a bounded width (Shopify's CDN resizes on request). */
export function boundedPhoto(url: string, px = PILOT_MAX_PX): string {
  const clean = url.replace(/([?&])width=\d+&?/, '$1').replace(/[?&]$/, '');
  return `${clean}${clean.includes('?') ? '&' : '?'}width=${px}`;
}

export function makePilotPack(items: readonly ManifestItem[], seed = 1): { pack: QuestionPack; notes: Record<string, string> } {
  const rng = createRng(hashSeed(`pilot-real:${seed}`));
  const dev = [...items].filter((i) => i.split === 'dev').sort((a, b) => (a.id < b.id ? -1 : 1));
  const byId = new Map(dev.map((i) => [i.id, i]));
  const splitOf = new Map(items.map((i) => [i.id, i.split]));
  const img = (i: ManifestItem): ShownImage => ({ productId: i.id, src: boundedPhoto(i.photoUrl) });
  const pick = <T>(xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(rng() * xs.length)] : undefined);
  /** Same type, different related group, optionally the same catalog colour. */
  const other = (a: ManifestItem, sameColour: boolean, not: readonly string[] = []) =>
    pick(dev.filter((x) => x.subcategoryId === a.subcategoryId && x.groupId !== a.groupId && !not.includes(x.id) && (!sameColour || x.color === a.color)));
  const questions: Question[] = [];
  const notes: Record<string, string> = {};
  const used = new Set<string>();
  const push = (q: Question, note: string) => {
    const ids = q.kind === 'triplet' ? [q.anchor, q.b, q.c] : q.kind === 'attributes' ? [q.product] : q.kind === 'relevance' ? [q.query, q.candidate] : [q.a, q.b];
    if (questionSplit(ids.map((x) => x.productId), splitOf) !== 'dev') throw new Error(`pilot question ${q.id} leaves the dev split`);
    questions.push(q);
    notes[q.id] = note;
    for (const x of ids) used.add(x.productId);
  };
  const triplet = (id: string, a: ManifestItem, m: ManifestItem, o: ManifestItem, stratum: Stratum, note: string) => {
    const flip = rng() < 0.5;
    push({ kind: 'triplet', id, anchor: img(a), b: img(flip ? o : m), c: img(flip ? m : o), stratum, ask: DIMENSIONS }, `${note}; design partner in ${flip ? 'c' : 'b'}`);
  };

  // Colour-variant partners (same page, other colour): the real-photo version of shape vs colour.
  const partners = dev.filter((i) => i.reason === 'colour-variant-partner' && i.partnerOf && byId.has(i.partnerOf));
  let n = 0;
  for (const p of partners) {
    if (n >= 3) break;
    const base = byId.get(p.partnerOf!)!;
    const o = other(base, true, [p.id]) ?? other(base, false, [p.id]);
    if (!o) continue;
    triplet(`p${String(++n).padStart(2, '0')}`, base, p, o, o.color === base.color ? 'shape-vs-colour' : 'random', `${o.color === base.color ? 'shape-vs-colour' : 'variant vs other'} (${base.subcategoryId})`);
  }
  // Ordinary same-type triplets.
  for (let k = 0; k < 3; k++) {
    const a = pick(dev.filter((x) => !used.has(x.id)));
    if (!a) break;
    const b = other(a, false);
    const c = b && other(a, false, [b.id]);
    if (!b || !c || b.groupId === c.groupId) continue;
    const flip = rng() < 0.5;
    push({ kind: 'triplet', id: `p${String(++n).padStart(2, '0')}`, anchor: img(a), b: img(flip ? c : b), c: img(flip ? b : c), stratum: 'random', ask: DIMENSIONS }, `random same-type triplet (${a.subcategoryId})`);
  }
  // Pairs: one variant pair, two random same-type pairs.
  const vp = partners.find((p) => !used.has(p.id));
  if (vp) push({ kind: 'pair', id: `p${String(++n).padStart(2, '0')}`, a: img(byId.get(vp.partnerOf!)!), b: img(vp), stratum: 'same-shape-diff-colour', ask: DIMENSIONS }, 'colour-variant pair');
  for (let k = 0; k < 2; k++) {
    const a = pick(dev.filter((x) => !used.has(x.id)));
    const b = a && other(a, false);
    if (a && b) push({ kind: 'pair', id: `p${String(++n).padStart(2, '0')}`, a: img(a), b: img(b), stratum: 'random', ask: DIMENSIONS }, `random same-type pair (${a.subcategoryId})`);
  }
  // Same thing: a same-photo partner if dev has one, else a variant pair.
  const sp = dev.find((i) => i.reason === 'same-photo-partner' && i.partnerOf && byId.has(i.partnerOf));
  const sameA = sp ? byId.get(sp.partnerOf!)! : partners[0] && byId.get(partners[0].partnerOf!)!;
  const sameB = sp ?? partners[0];
  if (sameA && sameB) push({ kind: 'same', id: `p${String(++n).padStart(2, '0')}`, a: img(sameA), b: img(sameB), stratum: 'random' }, sp ? 'same-photo partner' : 'colour-variant partner');
  // Attributes for two products.
  for (let k = 0; k < 2; k++) {
    const a = pick(dev.filter((x) => !used.has(x.id)));
    if (a) push({ kind: 'attributes', id: `p${String(++n).padStart(2, '0')}`, product: img(a) }, `attributes (${a.subcategoryId}, ${a.photoKind ?? 'photo kind unmeasured'})`);
  }
  return {
    pack: { version: LABELS_VERSION, id: `pilot-real-dev-${seed}`, title: 'Real-photo timing pilot (dev products only)', purpose: 'calibration', questions },
    notes,
  };
}
