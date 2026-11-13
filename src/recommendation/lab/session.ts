/**
 * One simulated session, run through the same pipeline the app uses (useDeck + listCandidates):
 *
 *  - the deck is one product type (like the app's room deck); only active, not-yet-swiped products
 *    are eligible (`isEligible`), and a batch of at most CANDIDATE_POOL_SIZE is drawn from them with
 *    the production sampler and seeds (`sampleIds`, `${deckKey}:${swipes}:candidates`);
 *  - the policy orders the batch; after every swipe it re-orders everything behind the two cards
 *    already on screen; when REFILL_AT cards are left, the next batch is drawn and appended;
 *  - a new phase (another product type) reloads the deck, as switching rooms does; learning carries over.
 *
 * Not modelled: Undo, app restarts (each reload re-seeds), the Weekly 10, onboarding rooms
 * (style picks are used instead), real dwell times, network failures.
 */
import type { Product, SubcategoryId, SwipeEvent } from '../../domain/types';
import { CANDIDATE_POOL_SIZE, REFILL_AT, sampleIds } from '../../lib/candidatePool';
import { computePriceBands } from '../engine';
import { createRng, hashSeed } from '../random';
import type { EngagementSignal } from '../signals';
import type { LabCatalog } from './catalog';
import type { Policy, PolicyContext } from './policies';
import { keeps, utility, type LabShopper } from './shoppers';

export interface Exposure {
  productId: string;
  swipe: number;
  phase: number;
  subcategoryId: SubcategoryId;
  u: number;
  /** Where this product's utility ranks among everything eligible in its segment (0..1, 1 = best). */
  percentile: number;
  love: boolean;
  gem: boolean;
  kept: boolean;
  family: string;
  designId: string;
  retailerId: string;
  styleTags: string[];
  overBudget: boolean;
  /** Shown although inactive, of another type, or already swiped (should never happen). */
  ineligible: boolean;
}

export interface SessionLog {
  shopperId: string;
  policy: string;
  catalogSeed: number;
  exposures: Exposure[];
  /** Sessions where a love / a hidden gem existed at all. */
  lovesAvailable: boolean;
  gemsAvailable: boolean;
  /** The deck ran dry while eligible products remained. */
  exhausted: boolean;
  /** Every product placed in a candidate batch (coverage). */
  batched: Set<string>;
  /** Best position of a hidden gem in the very first ordered deck (Infinity if none). */
  firstDeckGemRank: number;
  timings: { rankMs: number[]; rerankMs: number[]; selectMs: number[] };
}

interface Segment {
  from: number;
  phase: number;
  sorted: number[];
  loves: Set<string>;
  gems: Set<string>;
}

const now = () => globalThis.performance.now();
/** Share of the catalog below which a family or store counts as long tail. */
export const LONG_TAIL_SHARE = 0.05;
/** A shopper's "loves": their top share of eligible products (at least one). */
export const LOVE_SHARE = 0.02;

function percentileOf(sorted: number[], u: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= u) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length ? lo / sorted.length : 0;
}

export function runLabSession(policy: Policy, shopper: LabShopper, catalog: LabCatalog): SessionLog {
  const active = catalog.products.filter((p) => catalog.truth.get(p.id)!.active);
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const bands = computePriceBands(active);
  const swipes: SwipeEvent[] = [];
  const signals: EngagementSignal[] = [];
  const known = new Map<string, Product>();
  const swiped = new Set<string>();
  const log: SessionLog = {
    shopperId: shopper.id,
    policy: policy.name,
    catalogSeed: catalog.config.seed,
    exposures: [],
    lovesAvailable: false,
    gemsAvailable: false,
    exhausted: false,
    batched: new Set(),
    firstDeckGemRank: Infinity,
    timings: { rankMs: [], rerankMs: [], selectMs: [] },
  };
  const longTail = (p: Product) =>
    (catalog.familyShare.get(catalog.truth.get(p.id)!.family) ?? 1) < LONG_TAIL_SHARE ||
    (catalog.retailerShare.get(p.retailerId) ?? 1) < LONG_TAIL_SHARE;

  // Segments: each phase, split again wherever the shopper's taste changes.
  const segments: Segment[] = [];
  let start = 0;
  shopper.phases.forEach((phase, pi) => {
    const cuts = new Set([start]);
    for (const proto of shopper.prototypes) {
      for (const c of [proto.from, proto.until]) if (c !== undefined && c > start && c < start + phase.swipes) cuts.add(c);
    }
    const eligible = active.filter((p) => p.subcategoryId === phase.subcategoryId);
    for (const from of [...cuts].sort((a, b) => a - b)) {
      const us = eligible.map((p) => ({ p, u: utility(shopper, p, catalog, from) })).sort((a, b) => a.u - b.u);
      const top = us.slice(-Math.max(1, Math.round(us.length * LOVE_SHARE)));
      const loves = new Set(top.map((x) => x.p.id));
      const gems = new Set(top.filter((x) => longTail(x.p)).map((x) => x.p.id));
      segments.push({ from, phase: pi, sorted: us.map((x) => x.u), loves, gems });
    }
    start += phase.swipes;
  });
  log.lovesAvailable = segments.some((s) => s.loves.size > 0);
  log.gemsAvailable = segments.some((s) => s.gems.size > 0);
  const segmentAt = (swipe: number) => [...segments].reverse().find((s) => swipe >= s.from)!;
  const allGems = new Set(segments.flatMap((s) => [...s.gems]));

  const ctx = (swipe: number): PolicyContext => ({
    swipes,
    signals,
    known,
    bands,
    statedStyles: shopper.statedStyles,
    statedBudget: shopper.budget ? { subcategoryId: shopper.budget.subcategoryId, maxCents: shopper.budget.maxCents } : null,
    oracle: policy.name === 'oracle' ? (p) => utility(shopper, p, catalog, swipe) : undefined,
  });

  let swipe = 0;
  shopper.phases.forEach((phase, phaseIndex) => {
    const deckKey = phase.subcategoryId;
    let deck: Product[] = [];
    let more = false;
    let position = 0;

    /** listCandidates: eligible = active, this type, not swiped (and not already in the deck); sample a batch. */
    const draw = (seedKey: string, exclude: Set<string>) => {
      const t0 = now();
      const eligible = active.filter((p) => p.subcategoryId === deckKey && !swiped.has(p.id) && !exclude.has(p.id)).map((p) => p.id);
      const picked = sampleIds(eligible, CANDIDATE_POOL_SIZE, hashSeed(seedKey));
      log.timings.selectMs.push(now() - t0);
      const batch = picked.map((id) => byId.get(id)!);
      for (const p of batch) {
        known.set(p.id, p);
        log.batched.add(p.id);
      }
      return { batch, complete: picked.length === eligible.length };
    };

    // Load (useDeck's main effect).
    const first = draw(`${deckKey}:${swipes.length}:candidates`, new Set());
    let t0 = now();
    deck = policy.rank(first.batch, ctx(swipe), hashSeed(`${deckKey}:${swipes.length}`));
    log.timings.rankMs.push(now() - t0);
    more = !first.complete;
    if (phaseIndex === 0) {
      const r = deck.findIndex((p) => allGems.has(p.id));
      log.firstDeckGemRank = r < 0 ? Infinity : r;
    }

    for (let k = 0; k < phase.swipes; k++) {
      if (deck.length === 0) {
        const left = active.some((p) => p.subcategoryId === deckKey && !swiped.has(p.id));
        if (left) log.exhausted = true;
        break;
      }
      const top = deck[0]!;
      const seg = segmentAt(swipe);
      const truth = catalog.truth.get(top.id)!;
      const u = utility(shopper, top, catalog, swipe);
      const tau = seg.sorted[Math.floor(seg.sorted.length * 0.8)] ?? 0;
      const kept = keeps(createRng(hashSeed(`${shopper.seed}:keep:${top.id}:${swipe}`)), u, tau);
      log.exposures.push({
        productId: top.id,
        swipe,
        phase: phaseIndex,
        subcategoryId: top.subcategoryId,
        u,
        percentile: percentileOf(seg.sorted, u),
        love: seg.loves.has(top.id),
        gem: seg.gems.has(top.id),
        kept,
        family: truth.family,
        designId: truth.designId,
        retailerId: top.retailerId,
        styleTags: top.styleTags,
        overBudget: !!shopper.budget && top.subcategoryId === shopper.budget.subcategoryId && top.priceCents > shopper.budget.maxCents,
        ineligible: !truth.active || top.subcategoryId !== deckKey || swiped.has(top.id),
      });

      // What the app records: the swipe, its dwell, and (for loved pieces) a detail open / list add.
      const at = 1_000_000 + swipe * 5000;
      swipes.push({ id: `s${swipe}`, productId: top.id, categoryId: top.categoryId, direction: kept ? 'keep' : 'skip', swipedAt: at });
      swiped.add(top.id);
      const dwell = u < tau - 1 ? 450 : Math.abs(u - tau) < 0.3 ? 4500 : 1800;
      signals.push({ id: `d${swipe}`, productId: top.id, type: 'swipe_dwell', at, value: dwell });
      if (kept && seg.loves.has(top.id)) {
        const r = createRng(hashSeed(`${shopper.seed}:engage:${top.id}`));
        if (r() < 0.5) signals.push({ id: `o${swipe}`, productId: top.id, type: 'detail_open', at: at + 1 });
        if (r() < 0.25) signals.push({ id: `l${swipe}`, productId: top.id, type: 'list_add', at: at + 2 });
      }
      swipe++;
      position++;

      const rest = deck.slice(1);
      t0 = now();
      deck = rest.length ? policy.rerank(rest, ctx(swipe), hashSeed(`${deckKey}:${swipes.length}`), position) : [];
      log.timings.rerankMs.push(now() - t0);

      // Refill (useDeck's refill effect).
      if (more && deck.length <= REFILL_AT) {
        const next = draw(`${deckKey}:${swipes.length}:refill`, new Set(deck.map((p) => p.id)));
        t0 = now();
        const ranked = policy.rank(next.batch, ctx(swipe), hashSeed(`${deckKey}:${swipes.length}:refill`));
        log.timings.rankMs.push(now() - t0);
        const have = new Set(deck.map((p) => p.id));
        deck = [...deck, ...ranked.filter((p) => !have.has(p.id))];
        more = !next.complete && next.batch.length > 0;
      }
    }
    // Keep the rest of the swipe budget aligned when a phase ends early.
    swipe = shopper.phases.slice(0, phaseIndex + 1).reduce((s, p) => s + p.swipes, 0);
  });
  return log;
}
