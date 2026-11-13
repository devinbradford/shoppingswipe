# CureAvo Engine Lab — V2 Baseline

**Prepared:** November 13, 2026 · **Engine measured:** V2 as of commit `fc85e5a` (Discovery Engine V3, phase 1) · **Lab:** `src/recommendation/lab/`, `scripts/engine-lab.ts`

**Everything in this report is synthetic.** Simulated shoppers on generated catalogs. Nothing here is evidence about real people, satisfaction, or purchases, and no keep rate below should be read as one. The lab exists so that V2 and every future V3 change are measured on exactly the same scenarios, seeds and definitions.

## 1. Summary

1. **V2 learns, reliably but slowly.** Across 12 of 14 scenarios its cards in swipes 41–60 rank about **+0.20** higher (utility percentile, paired 95% CIs entirely above zero) than a random order. It finds a shopper's first "love" (a top-2% product) after **~24 swipes** with no onboarding, versus ~36 for random.
2. **The first 10 cards are close to random (0.52 vs 0.48).** This is by design: the cold start deliberately spreads across styles. But a naive tag-matching baseline beats V2 in the first 20 cards in most scenarios, and **when the shopper states their style, the naive baseline beats V2 at every point in the session** (0.83 vs 0.67 in the first 10, 0.79 vs 0.73 late).
3. **V2 is strong where its features match the problem:** strict budgets (late relevance 0.83, 11% over-budget cards vs 71% for random), recovering from a wrong onboarding choice (38 swipes vs 55 for random), and giving small stores exposure when one store dominates (hidden gem found in 62% of sessions vs 20% for random).
4. **V2 fails where taste isn't in its tags.**
   - **Hidden gem:** a design V2 has no word for, from a small store, is found no more often than by random order (26% vs 33%, CIs overlap).
   - **Change of mind:** after the shopper's taste switches mid-session, V2 is no better than random for the next 10 cards.
   - **Per-type taste:** nightstand taste carries over into sofas and makes the first sofa cards *worse than random* (0.45 vs 0.49).
   - **Variants:** 37% of cards repeat a design shown in the previous five, because colour variants look different to V2's tags.
5. **Production finding (not a lab artifact):** the candidate sample and first deck order are seeded only by deck and swipe count, with nothing from the shopper. **Every new shopper opening the same deck sees the identical first 1,000-product sample and the same first cards.** At 10,000 products, only 34% of eligible nightstands ever entered a first-session candidate batch across 90 shoppers. Each shopper still rotates through the catalog as their swipe count grows (P1-1 holds per shopper), but the first session is the same for everyone.
6. **Reliability:** 5,040 sessions, zero ineligible cards, zero repeated cards, zero decks running dry with products left.
7. **Speed:** re-ranking ~5 ms per swipe (median) at 1,000 candidates in Node on a server CPU, roughly flat from 1k to 10k products. That's because the candidate cap holds the ranking input at ≤1,000. These timings are not from a phone.

## 2. How to run it

**Benchmark runtime (this baseline):** the full run took **11 min 22 s** wall time (Node 22, server CPU, single thread): 5,040 sessions × 60 swipes. The 10k scenario is the slowest (about 3 s per V2 session, including the lab's own ground-truth bookkeeping). The `--perf` pass takes under a minute.

**During V3 development, use the smaller repeatable runs** (`v3` below is the policy V3 will register; it doesn't exist yet). They're deterministic (same seeds, same shoppers), so two runs of the same code give identical quality numbers:

```bash
npm run engine-lab -- --quick --policies v2,v3,random
```

4 shoppers × 1 catalog over all scenarios: about 35 seconds. Good for a smoke check.

```bash
npm run engine-lab -- --shoppers 10 --seeds 1 --scenarios S01-cold,S06-visual-only,S07-hidden-gem,S05-taste-shift --policies v2,v3
```

About 1 minute, paired V3 vs V2 on the three main weaknesses. The confidence intervals are wider; confirm promising results with the full run.

```bash
npx jest src/recommendation/__tests__/engineLab.test.ts
```

About 20 seconds, including the golden V2 snapshot.


```bash
npm run engine-lab
```

The full baseline: 14 scenarios × 4 policies × 30 shoppers × 3 catalogs = 5,040 sessions, about 11 minutes.

```bash
npm run engine-lab -- --quick
```

A smoke run: 4 shoppers × 1 catalog, about 35 seconds.

```bash
npm run engine-lab -- --scenarios S07-hidden-gem,S10-near-duplicates --policies v2,random
```

```bash
npm run engine-lab -- --out docs/engine-lab/v2-baseline.json
```

```bash
npm run engine-lab -- --perf
```

`--perf` measures timing and memory at 1k, 3k and 10k products.

Results for this report: [`docs/engine-lab/v2-baseline.json`](engine-lab/v2-baseline.json) (machine-readable) and [`docs/engine-lab/v2-baseline.md`](engine-lab/v2-baseline.md) (every table, every metric, with confidence intervals). Correctness tests live in `src/recommendation/__tests__/engineLab.test.ts`, including a **golden snapshot that fails if V2's ranking or learning changes**. I checked this: changing the probe rhythm from 7 to 8 fails it.

**Adding V3:** implement `Policy` (`rank` a fresh batch, `rerank` after a swipe with two cards pinned) in `src/recommendation/lab/policies.ts`, register it in `POLICIES`, and run with `--policies v2,v3,random,content,oracle`. Every scenario, seed, shopper and metric stays identical, and comparisons are paired by shopper and catalog.

## 3. Audit of the existing simulator (`sim/simulate.ts`)

The existing simulator stays as it is: the personalization, rooms and Your taste tests depend on it. The lab is a separate harness that reuses the production engine and the existing random-number helpers.

**Where the old simulator favours V2 by construction:**

| Issue | Effect |
| --- | --- |
| Shopper utility is a weighted sum over `style:`, `material:` and `color:` keys, exactly V2's feature keys | V2 can represent the true taste perfectly; any linear learner looks good |
| Tags are ground truth: no wrong, missing or defaulted labels | Real feeds have them; the importer defaults unknown styles to "modern" |
| No visual properties beyond tags | Shape, visual weight and finish can't matter to shoppers |
| The price ceiling is defined on V2's own ln-price-ratio scale | Budget learning is measured in the model's own units |
| Catalog tags are independent random draws (no coherent design families, no duplicates, uniform stores, nothing inactive) | Diversity, duplicates and store effects can't show up |
| Metrics are keep rates and utility in the same feature space | They measure fit to V2's representation, not discovery |

**Where it differs from the production pipeline:**

| Old simulator | Production (`useDeck` + `listCandidates`) | Engine Lab |
| --- | --- | --- |
| Whole room (e.g. 600 products) passed to `rankDeck` | Eligible products of the deck's type, sampled into batches of ≤1,000 (`sampleIds`), refilled at 30 cards left | Same as production (same functions, constants and seeds) |
| Room deck | Room or product-type deck; For you across rooms | Product-type deck (the nightstand journey); room switch as a new phase |
| One engine variant uses the questions feature | Questions removed from the app | No questions |
| Seeds per shopper and engine | Seeds per deck and swipe count | Production seeds (this is how the shared-first-deck finding surfaced) |
| No inactive products, no stated budget | Inactive hidden; Profile budget feeds the model | Both modelled |
| Model sees the whole catalog | Model sees the candidates plus swiped products | Same as production |

**What the lab still doesn't model:**
- Onboarding rooms: style picks are used instead.
- Undo, app restarts, the Weekly 10 and the For you deck across all rooms.
- Real dwell times, product-page browsing and network failures.
- Refill: with a 1,000-card pool, it isn't reached within a 60-swipe session, in the app as here. The P1-1 tests cover it.

## 4. Lab design

**Catalogs** (`lab/catalog.ts`, deterministic per seed): fictional furniture, 30% nightstands, the rest spread across the other 10 types. Every product has visible fields (the real `Product`) and a hidden truth:
- **14 design families.** Two of them (sculptural, japandi) have no word in V2's vocabulary, so their listings say "modern", as the importer does.
- **A position in a 6-dimension visual space:** warmth, curvature, mass, ornament, texture, sheen. Curvature, mass and sheen have no tag of any kind.
- **A design id shared by near-duplicate variants**, a hidden quality, and an active flag.
- **Visible labels derived from the truth with noise:** 12% wrong or missing by default (35% in S09), a second style tag 30% of the time, colours only loosely tied to design.
- **Store mixes:** balanced, or one store with ~70% of the catalog (S11).
- **Long tail:** the long-tail design comes mostly from one small store.
- **Inactive:** 3% switched off.

**Shoppers** (`lab/shoppers.ts`): tastes are prototypes in the hidden visual space (Gaussian kernel), plus hidden quality and fixed per-product noise. **Relabelling a product never changes how much a shopper likes it** (tested).
- Shoppers keep with probability sigmoid(4 · (utility − their 80th-percentile utility)), so about 20–30% of random cards are kept.
- A **love** is a product in the shopper's top 2% of the eligible type.
- A **hidden gem** is a love from a long-tail design family or store (under 5% of the catalog).

**Policies** (`lab/policies.ts`):
- **`v2`:** production `buildTasteModel` + `rankDeck`/`rerankDeck`, called exactly as `useDeck` calls them. A test checks the first deck equals a direct `rankDeck` call.
- **`random`:** seeded random order.
- **`content`:** Jaccard similarity of style, material and colour tags to kept minus skipped products, plus stated styles; no exploration.
- **`oracle`:** sorted by hidden utility. An unreachable upper bound that exists only for context.

**Fairness:**
- Fixed seeds; the same shoppers and catalogs for every policy.
- A shopper's keep decision depends only on shopper, product and position, so it's identical across policies.
- 90 sessions per policy per scenario (30 shoppers × 3 catalog seeds).
- Means with seeded percentile-bootstrap 95% intervals.
- V2 − random reported as a paired difference over identical sessions.

## 5. Metric definitions

| Metric | Definition |
| --- | --- |
| relevance@a–b | Mean utility percentile of cards a..b among everything eligible: 0.5 ≈ random order, 1.0 = best possible |
| first love | Swipe number of the first top-2% product shown (61 if none in 60 swipes) |
| love found | Share of sessions showing at least one love in 60 swipes |
| loves@20 | Loves among the first 20 cards |
| gem found | Share of sessions (where a hidden gem exists) showing one |
| families@20 / styles@20 | Distinct true design families / distinct style tags in the first 20 cards |
| retailers@20, bigStore@20 | Distinct stores in the first 20 cards; share of the first 20 from the biggest store |
| nearDup | Share of cards whose design appeared in the previous 5 cards |
| recovery | First swipe at which the rolling 10-card relevance reaches 0.7 (61 = never) |
| overBudget | Share of cards above a strict stated budget |
| coverage | Share of the eligible type that entered any candidate batch / was shown, across all sessions |
| ineligible, repeated, ran dry | Inactive, wrong-type or already-swiped cards; cards shown twice; decks empty while eligible products remain (all must be 0) |
| keep rate | Simulated keep share. **Synthetic, not satisfaction or conversion**; reported only in the full tables |

## 6. Baseline results

90 sessions per policy per scenario, 60 swipes each, 3,000-product catalog unless stated. The paired column is V2 − random over the same sessions.

| Scenario | relevance 1–10 (v2 / random / content) | relevance 41–60 (v2 / random / content) | first love, swipes (v2 / random) | love found by 60 (v2 / random) | V2 − random, relevance 41–60 (95% CI) |
|---|---|---|---|---|---|
| S01 No onboarding | 0.52 / 0.48 / 0.58 | 0.70 / 0.49 / 0.66 | 24.0 / 36.4 | 90% / 71% | +0.21 (+0.18 to +0.24) |
| S02 Knows their style | 0.67 / 0.50 / **0.83** | 0.73 / 0.50 / **0.79** | 11.1 / 34.7 | 97% / 74% | +0.23 (+0.20 to +0.26) |
| S03 Two distinct aesthetics | 0.52 / 0.48 / 0.56 | 0.70 / 0.49 / 0.66 | 26.7 / 33.2 | 92% / 77% | +0.20 (+0.18 to +0.22) |
| S04 Different taste per type (nightstands → sofas) | 0.55 / 0.49 / 0.57 | 0.56 / 0.49 / 0.47 | 25.7 / 32.7 | 83% / 77% | +0.07 (+0.04 to +0.10) |
| S05 Taste changes at swipe 30 | 0.52 / 0.48 / 0.54 | 0.54 / 0.50 / 0.50 | 29.1 / 37.3 | 82% / 66% | +0.04 (+0.01 to +0.08) |
| S06 Taste in untagged visual traits | 0.54 / 0.49 / 0.55 | 0.63 / 0.49 / 0.59 | 27.8 / 32.6 | 83% / 80% | +0.14 (+0.12 to +0.17) |
| S07 Hidden gem | 0.53 / 0.48 / 0.51 | 0.56 / 0.50 / 0.53 | 34.0 / 32.9 | 80% / 66% | +0.05 (+0.03 to +0.07) |
| S08 Strict budget | 0.71 / 0.45 / 0.48 | **0.83** / 0.53 / 0.53 | 19.3 / 33.6 | 99% / 80% | +0.30 (+0.29 to +0.31) |
| S09 35% wrong or missing labels | 0.55 / 0.52 / 0.57 | 0.66 / 0.49 / 0.58 | 26.7 / 37.3 | 86% / 64% | +0.17 (+0.14 to +0.19) |
| S10 6 near-duplicate variants per design | 0.56 / 0.49 / 0.53 | 0.73 / 0.53 / 0.63 | 31.8 / 34.0 | 80% / 73% | +0.20 (+0.17 to +0.23) |
| S11 One store lists ~70% | 0.52 / 0.46 / 0.53 | 0.69 / 0.49 / 0.64 | 28.0 / 33.1 | 87% / 78% | +0.20 (+0.17 to +0.23) |
| S12 Onboarding picks the wrong style | 0.47 / 0.49 / 0.42 | 0.69 / 0.49 / 0.54 | 32.2 / 31.9 | 84% / 78% | +0.20 (+0.17 to +0.23) |
| S13 1,000-product catalog | 0.53 / 0.50 / 0.55 | 0.58 / 0.51 / 0.55 | 25.5 / 32.5 | 89% / 80% | +0.06 (+0.04 to +0.08) |
| S14 10,000-product catalog | 0.55 / 0.49 / 0.55 | 0.71 / 0.49 / 0.65 | 25.6 / 35.6 | 84% / 69% | +0.22 (+0.19 to +0.24) |

The oracle scores 0.94–0.99 on every window, and 0.83 late at 1k products, where there are fewer top products to show. The distance between V2 and the oracle is the room V3 has to improve.

### Discovery and diversity (V2, first 20 cards unless noted)

| Scenario | families@20 (v2 / random / content) | nearDup (v2 / random) | gem found (v2 / random / content) | bigStore@20 (v2 / random; catalog share ~70%) |
|---|---|---|---|---|
| S01 No onboarding | 8.8 / 11.7 / 5.5 | 0% / 0% | — | — |
| S03 Two aesthetics | 8.9 / 11.7 / 5.8 | — | — | — |
| S07 Hidden gem | 9.0 / — / — | — | **26% / 33% / 3%** | — |
| S10 Near-duplicates | 8.1 / 10.0 / 6.2 | **37% / 1%** | — | — |
| S11 Store imbalance | 8.4 / — / — | — | **62% / 20% / 41%** | **52% / 67%** |

### Adaptation and recovery (V2 / random / content)

| Scenario | Measure | V2 | random | content |
|---|---|---|---|---|
| S04 per-type taste | relevance, first 10 sofa cards (swipes 31–40) | **0.45** | 0.49 | 0.46 |
| S05 change of mind | relevance, 10 cards after the change (31–40) | **0.46** | 0.48 | 0.48 |
| S12 wrong onboarding | swipes until rolling relevance ≥ 0.7 | **38.4** | 55.1 | 51.7 |
| S08 strict budget | over-budget cards | **11%** | 71% | 67% |

### Reliability (all 14 scenarios)

| Policy | sessions | ineligible cards | repeated cards | decks run dry with products left |
| --- | --- | --- | --- | --- |
| v2 | 1,260 | 0 | 0 | 0 |
| random | 1,260 | 0 | 0 | 0 |
| content | 1,260 | 0 | 0 | 0 |
| oracle | 1,260 | 0 | 0 | 0 |

**Coverage:** 100% of eligible nightstands entered a candidate batch at 1k and 3k products. At 10k (3,051 nightstands) only **34%** did across 90 sessions, and 25% were ever shown. See finding 5 in the summary.

### Performance (V2, Node 22, server CPU; not a phone)

| Catalog | nightstands | first rank median / p95 (ms) | re-rank per swipe median / p95 (ms) | candidate selection median (ms) | heap Δ for 6 sessions (MB) |
| --- | --- | --- | --- | --- | --- |
| 1,000 | 303 | 3.9 / 5.6 | 3.4 / 5.3 | 0.1 | 9.6 |
| 3,000 | 917 | 2.4 / 2.9 | 5.0 / 7.5 | 0.2 | 5.1 |
| 10,000 | 3,051 | 2.3 / 3.8 | 5.5 / 8.4 | 1.8 | 6.8 |

The first rank is cheap because it uses the cold-start spread. Re-ranking is bounded by the 1,000-candidate cap, so it barely grows with the catalog. Candidate selection grows linearly (1.8 ms at 10k). The heap change is noisy. In the app, the earlier audit estimated 25–45 ms of work per swipe in Node, including the model rebuild over a real history. Phones will be slower; this needs measuring on a budget Android device.

### V2 against each reference, with 95% intervals

Mean (bootstrap 95% interval), 90 sessions each. Random is the floor, the content baseline is the simplest reasonable alternative, and the oracle is the ceiling no real engine can reach.

| Scenario | Metric | V2 | random | content | oracle |
|---|---|---|---|---|---|
| S01 cold | relevance 1–10 | 0.52 (0.49–0.54) | 0.48 (0.46–0.50) | 0.58 (0.55–0.61) | 0.99 |
| S01 cold | relevance 41–60 | 0.70 (0.67–0.73) | 0.49 (0.48–0.50) | 0.66 (0.62–0.69) | 0.94 |
| S01 cold | first love (swipes) | 24.0 (20.5–27.7) | 36.4 (31.7–40.8) | 30.9 (26.3–36.5) | 1.0 |
| S02 knows style | relevance 1–10 | 0.67 (0.65–0.70) | 0.50 (0.48–0.51) | 0.83 (0.80–0.85) | 0.99 |
| S02 knows style | relevance 41–60 | 0.73 (0.71–0.75) | 0.50 (0.49–0.51) | 0.79 (0.77–0.80) | 0.94 |
| S02 knows style | first love (swipes) | 11.1 (9.0–13.6) | 34.7 (30.3–39.1) | 6.0 (4.7–7.4) | 1.0 |
| S04 per-type taste | relevance 31–40 (first sofas) | 0.45 (0.43–0.47) | 0.49 (0.47–0.50) | 0.46 (0.44–0.48) | 0.99 |
| S05 change of mind | relevance 31–40 (after change) | 0.46 (0.44–0.49) | 0.48 (0.46–0.50) | 0.48 (0.46–0.51) | 0.90 |
| S05 change of mind | relevance 41–60 | 0.54 (0.52–0.57) | 0.50 (0.49–0.52) | 0.50 (0.47–0.53) | 0.98 |
| S06 visual-only | relevance 41–60 | 0.63 (0.61–0.66) | 0.49 (0.47–0.50) | 0.59 (0.56–0.62) | 0.94 |
| S06 visual-only | loves in first 20 | 0.6 (0.4–0.8) | 0.5 (0.4–0.6) | 0.6 (0.4–0.8) | 17.3 |
| S07 hidden gem | gem found | 26% (17–36) | 33% (24–42) | 3% (0–8) | 100% |
| S07 hidden gem | relevance 11–20 | 0.54 (0.52–0.56) | 0.60 (0.58–0.61) | 0.51 (0.49–0.54) | 0.98 |
| S08 strict budget | over-budget cards | 11% (10–12) | 71% (70–71) | 67% (66–68) | 0% |
| S10 variants | near-duplicate cards | 37% (35–39) | 1% (1–1) | 35% (33–37) | 41% |

**Tradeoffs in one line each:**
- **V2 vs content:** V2 trades early relevance for exploration. It loses to tag matching in the first 10–20 cards, and throughout when the style is stated. It wins late in the session, under label noise, after a wrong start, and on budget.
- **V2 vs random:** better in every scenario except hidden gems and the first cards after a change of taste.
- **V2 vs oracle:** a gap of 0.2–0.4 in late relevance everywhere, and about 1 love in the first 20 cards versus ~17 possible.

## 7. V2's three most important weaknesses

1. **Visual-only preferences (S06).** When taste lives in silhouette, visual weight and finish (dimensions no tag describes), V2 reaches 0.63 late relevance against an oracle of 0.94. It shows the shopper about the same number of loves in the first 20 cards as random order (0.6 vs 0.5). What V2 does learn comes only from tags that happen to correlate with the look. This is the core gap that visual features would address.
2. **Hidden-gem discovery (S07).** A design V2 has no word for, sold mostly by one small store and labelled "modern", is found in 26% of sessions, against 33% for random (intervals overlap). In swipes 11–20 V2 is *worse* than random (0.54 vs 0.60): it learns the generic tag the gems share with mainstream products and fills the deck with the wrong "modern" pieces. The one place V2 helps long-tail stores is when the long tail is a store effect (S11, 62% vs 20%), not a design effect.
3. **Changing tastes (S05, and per-type taste in S04).** After a change of mind at swipe 30, the next 10 cards are no better than random (0.46 vs 0.48). It takes the rest of the session to reach 0.54. Nightstand taste likewise makes the first sofa cards worse than random (0.45 vs 0.49), because V2 has one global taste with long-memory evidence.

## 8. Where V2 performs well

- **It learns from swipes alone.** Late relevance is +0.20 above random in most scenarios, and the first love comes about 12 swipes sooner.
- **It responds to explicit constraints.** The budget scenario is its best result: late relevance 0.83, and over-budget cards cut from 71% to 11%.
- **It recovers from a wrong start.** It reaches good relevance about 17 swipes sooner than random when onboarding is wrong. The content baseline never really recovers.
- **It explores broadly** (8–9 design families in the first 20 cards), and it **gives small stores a fair share.** When one store has 70% of the catalog, only 52% of V2's first 20 cards come from it, and it finds long-tail gems 3× as often as random.
- **It degrades gracefully with label noise** (late relevance 0.66 at 35% noise vs 0.70 clean), and **holds quality at 10k products.**
- **It is reliable:** zero eligibility, duplicate or exhaustion errors in 5,040 sessions.

## 9. Other weaknesses

1. **Stated taste is under-used.** With a correct style pick, a naive tag-matching baseline beats V2 from the first card to the last. V2's cold-start spread and exploration dilute strong, explicit evidence.
2. **The first 10 cards are near random** in every scenario without onboarding (0.47–0.56). The broad cold-start spread teaches the model, but the shopper gets almost nothing they love early: about 1 love in the first 20 cards, against ~17 possible.
3. **It can't see what tags don't describe.** Taste in shape, weight and finish (S06) reaches only 0.63 late, against an oracle of 0.94. A design V2 has no word for (S07) is found no more often than by chance. Its "modern" tag is shared with mainstream products, so V2 learns "modern" and floods the deck with the wrong pieces (relevance in swipes 11–20 is 0.54, below random's 0.60).
4. **One global taste.** Nightstand preferences make the first sofa cards worse than random. A mid-session change of mind takes more than 10 cards to register.
5. **It can't detect variants.** Colour variants of one design look like different products to V2's tags, so 37% of cards repeat a recently shown design when catalogs carry variants.
6. **Two shoppers, one taste.** With two distinct aesthetics, V2 explores both but its late relevance (0.70) is no better than for single-taste shoppers. The lab doesn't yet measure whether both tastes stay represented late in the session; that metric should be added.
7. **Every new shopper gets the same first deck** (production seeding; see the summary).

## 10. Synthetic results vs real shopper behaviour

Nothing above was measured on people. The lab's shoppers are formulas: their taste, their keep decisions, what counts as a "love" and how fast they swipe were all chosen by me. They were made independent of V2's features on purpose, but they are still assumptions.

Use the lab to compare engines on identical, controlled conditions and to catch regressions. Don't use it to predict real satisfaction, keep rates, time to purchase, or conversion. Real evidence will come from the first 10–20 testers (section 5 of the V3 plan) and, later, consented interaction logs. When the two disagree, real behaviour wins and the lab's assumptions should be revised.

## 11. Limitations of this evaluation

- **Synthetic shoppers and catalogs.** The hidden visual space, families and behaviour model are designed, not measured. They were chosen to be independent of V2's features, but they encode my assumptions about how furniture taste works. Results show *relative* strengths and failure modes under those assumptions.
- **The lab's own representation could bias V3.** If V3 learns a space shaped like this one, it could look better here than it really is. Before trusting V3 gains, the lab should be re-run with shoppers defined on real image embeddings and human labels (Milestone 1's 200-item golden set).
- **The keep model is invented.** Keep rates are not satisfaction, and nothing here says anything about purchases or conversion.
- **Not modelled:**
  - onboarding rooms (style picks are used instead), Undo, restarts and the Weekly 10;
  - For you across all rooms;
  - product-page signals beyond a simple detail-open and list-add rule;
  - real dwell times.
- **Timings come from Node on a server CPU,** not from phones.

**Data needed to measure what this can't:**
- **Real relevance and satisfaction:** consented interaction logs with impression ids, rank position, policy version and price shown; plus short in-app ratings ("Would you have found this elsewhere?").
- **Visual similarity and visual taste:** licensed product images, an embedding model, and a human-labelled golden set of similar and dissimilar pairs.
- **Real near-duplicates:** variant and group ids from feeds (partly there: the import groups by product page and colour) plus image hashes.
- **Conversion:** retailer-verified purchase data (Awin transaction reports), kept separate from self-reported "I bought it".
- **Real diversity and long-tail value:** real catalog snapshots with store and brand shares over time.
- **On-device performance:** profiling on a budget Android phone and an older iPhone.

## 12. What to measure V3 against

Use this table as the scorecard. A V3 change should be judged on paired differences against V2 in the same scenarios, not on one headline.

| Goal | Scenario(s) | V2 baseline | Direction |
| --- | --- | --- | --- |
| Earlier relevance without losing exploration | S01, S02 | relevance 1–10: 0.52 / 0.67; families@20: 8.8 | ↑ relevance, keep ≥ 6 families |
| Use stated taste at least as well as tag matching | S02 | 0.67 vs content 0.83 (1–10) | ≥ content |
| Visual taste | S06 | 0.63 (41–60) | ↑ toward oracle 0.94 |
| Hidden gems | S07, S11 | 26% / 62% | ↑ |
| Per-type taste | S04 | 0.45 (31–40) | ≥ random 0.49, then ↑ |
| Follow a change of mind | S05 | 0.46 (31–40) | ↑ |
| Variants | S10 | nearDup 37% | ↓ toward random's 1% |
| Budget | S08 | 11% over budget | ↓ (0% when the budget is stated as strict) |
| Reliability | all | 0 / 0 / 0 | stay 0 |
| First-session catalog coverage | S14 | 34% batched | ↑ (shopper-specific seeding) |
| Speed | perf | ~5 ms re-rank (Node) | no worse on device |
