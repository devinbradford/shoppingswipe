# CureAvo Discovery Engine V3 — Architecture, Audit, and Build Plan

**Prepared:** November 10, 2026  
**Repository:** https://github.com/devinbradford/shoppingswipe  
**Status:** Read-only source inspection and proposed implementation. **No code was changed, cloned, executed, or benchmarked against the live Supabase project during this audit.**

## 1. Product intent and engineering objective

CureAvo is not a conventional search-and-filter store. The core use case is: a shopper knows they need a nightstand, but does not yet know which aesthetic they love. They swipe through interesting, credible products from multiple retailers. After a modest number of interactions the app starts surfacing designs that reflect emerging taste without trapping them in a repetitive echo chamber. Eventually they find an unexpectedly perfect product from a retailer they might never have searched themselves.

The engine must optimize **successful personal discovery**, not only maximum keep rate or maximum affiliate clicks. It must also handle changing tastes and distinct shopping missions while remembering useful long-term patterns.

Key principles:
- Discovery first: strong matches **and** informative, plausible surprises.
- Accurate catalog first: no ranking algorithm can recover missing, incorrectly labeled, unavailable, or excluded inventory.
- Keep global taste, category-specific taste, and current mission distinct.
- Make relevance judgments from both visual understanding and reliable retailer facts.
- Respect explicit user constraints and retailer reliability.
- Measure customer outcomes with real exposure and engagement data; do not trust synthetic keep-rate gains alone.
- Keep the swipe UI responsive; preference updates should not block animations.
- Guard against popularity, retailer, affiliate payout, and position bias.

## 2. Repository facts inspected

- Expo SDK 58 / React Native 0.88, TypeScript, Supabase, Zustand: [`CLAUDE.md`](https://github.com/devinbradford/shoppingswipe/blob/main/CLAUDE.md), [`package.json`](https://github.com/devinbradford/shoppingswipe/blob/main/package.json).
- Existing pure TypeScript engine: [`src/recommendation/model.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/recommendation/model.ts), [`rank.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/recommendation/rank.ts), [`engine.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/recommendation/engine.ts).
- App plumbing: [`src/hooks/useDeck.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/hooks/useDeck.ts), [`src/hooks/tasteModel.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/hooks/tasteModel.ts).
- Input data: [`src/domain/types.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/domain/types.ts), [`src/data/SupabaseProductRepository.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/data/SupabaseProductRepository.ts), [`src/feeds/classify.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/feeds/classify.ts).
- Signals: [`src/recommendation/signals.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/recommendation/signals.ts), [`src/store/signalStore.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/store/signalStore.ts), [`src/store/swipeStore.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/store/swipeStore.ts).
- Synthetic evaluation: [`src/recommendation/sim/simulate.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/recommendation/sim/simulate.ts), [`scripts/engine-report.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/scripts/engine-report.ts).
- Feed automation: [`.github/workflows/import-feeds.yml`](https://github.com/devinbradford/shoppingswipe/blob/main/.github/workflows/import-feeds.yml).

## 3. Findings ordered by engineering priority

### P0 — Catalog truncation, deterministic coverage bias

`SupabaseProductRepository.listProducts` has `const want = limit ?? 1000`, orders the query by ID, and caps rows at 1,000 via `Math.min(1000, want + excludeIds.size)` before applying `excludeIds` locally. With more than 1,000 eligible products, this can leave later IDs undiscoverable and can exhaust the deck despite remaining inventory. This is especially consequential given the repository notes documenting roughly 1,929 products from the three initial live-feed stores. A cap may also reduce availability unevenly by category or brand.

**Remedy:** change the repository contract to a paginated/filterable candidate-access method. Use server-side exclusion or cursor/keyset pagination; do not fetch all images, descriptions, and metadata to the handset. Build a candidate generation service that can retrieve diverse batches across the **entire** eligible corpus and return opaque page tokens. Avoid offset-based paging for changing feeds. Measure per-retailer and per-subcategory coverage.

**Regression tests:** generate 3,000 eligible products with ordered IDs; verify a product at index 2,800 can be retrieved, selected, and served. After 1,000 exclusions, the deck must still have remaining candidates. Prove filters/active-state are correct and pagination has no duplicate or missing IDs across a static dataset.

### P0 — Text labels cannot express the target aesthetic

`Product` currently carries `styleTags`, one `material`, one `color`, and photos. `productFeatures()` feeds style, material, color, brand, retailer, and price band into the model. `readStyles()` uses text regular expressions and defaults to `modern` when no style match is found. This can mislabel styles and cannot represent shape, silhouette, upholstery, leg design, finish, fluting, proportion, image composition, or nuanced visual similarity.

**Remedy:** enrich products offline with structured appearance attributes and **visual embeddings** from appropriately licensed images. Keep source retailer facts distinct from inferred visual attributes. Store model version and confidence. Mark unknown as unknown, rather than defaulting to generic modern. Normalize synonyms to a controlled taxonomy; keep multiple attributes where appropriate. Use image embeddings primarily for candidate recall/similarity, not as a replacement for hard category/price facts.

**First 200-item pilot:** manually label ~200 diverse furniture listings as a quality-control set; measure category correctness, color accuracy, style-label precision, and human-rated pairwise visual similarity before bulk enrichment.

### P1 — Retrieval pool limits exploration

`rankDeck()` sorts all provided candidates, keeps only the top 300 for its first 40 polished placements, and draws forced probes from that top-300 pool. This is not global discovery: a product outside the pool cannot become an early probe. `informativeStart()` only runs when zero swipes, zero positive signals, and no seed. After one swipe the engine stops using that broad starter selection, even while user confidence may remain low.

**Remedy:** make retrieval an explicit mixture of independent channels: high-confidence favorites, category-relevant visual nearest neighbors, uncertain/informative probes, diverse stylistic clusters, and quality-vetted long-tail products. Do not generate all exploration candidates from a list already sorted by predicted match. Continue meaningful exploration as long as the model's confidence is low; use dynamic weighting based on uncertainty rather than a fixed first-swipe switch or constant every-seventh slot.

**Regression tests:** rank a synthetic corpus of 3,000 where a relevant hidden gem is outside the initial V2 top 300; verify the retrieval stage can surface it under controlled exploration. Test that near-twins do not dominate the first 20. Test that one initial Skip does not force premature convergence.

### P1 — Global taste is not the same as a shopping mission

`currentTasteModel()` is built from all swipes and signals; the model has short/long decay but no explicit session identity and no dedicated per-subcategory preference profile. `SwipeEvent` stores room `categoryId` but not product type or shopping mission. Strong globally learned color/material likes could overwhelm a new nightstand search; a nightstand-specific preference may contaminate future sofa suggestions.

**Remedy:** three preference scopes: (a) persistent global aesthetic prior, (b) category/subcategory taste with shrinkage to global prior when sparse, (c) current **mission** with its own recency and optional budget/shape/size constraints. Learn mission-specific signals more quickly, without treating a one-off purchase as a lifelong identity. Preserve user choice: Keep/Skip remains the default interface; optional controls should not turn the feed into a questionnaire.

**Event contract:** `mission_id`, `session_id`, `subcategory_id`, action, product ID, timestamp, optional explicit constraints. Use versioned schema and idempotent sync; migration must not erase historic swipe events.

### P1 — Benchmark optimistic by construction

`sim/simulate.ts` generates each synthetic shopper's preferences from the same style/material/color keys that the model can observe. It uses those features to calculate synthetic shopper utility. The code itself warns that real-world gains are likely smaller. Its random shopper and action distributions are not validated against real use. It currently measures keep rate, late utility, over-budget exposure, confident dislikes, and near-neighbor similarity, but not long-tail retailer discovery, session intent, product image mismatch, or conversion verification.

**Remedy:** retain synthetic tests as regression guards, but add adversarial simulations and real-human tests: image-only tastes, interactions among attributes, category-dependent preferences, changing mission, sparse onboarding, price confounding, many near-duplicate variants, data-label corruption, and long-tail hidden-gem preference. Once consented real event data exist, use time-separated holdouts and staged experiments. For unbiased off-policy evaluation, log selection probabilities when using stochastic policies; don't make causal claims from raw clicks.

### P1 — Signals and measurement aren't yet fully durable

`signalStore.ts` records engagement, feature feedback, and dwell locally; the repository documents these signals as not synced. `SwipeEvent` lacks an impression/exposure ID, model version, rank position, and mission ID. `useDeck()` measures dwell as wall-clock time from when a top card appears; application background time could distort it. The `purchase` signal is self-reported, not retailer-verified.

**Remedy:** create an append-only, privacy-conscious event pipeline with impression ID, session/mission ID, product ID, policy version, position, displayed price, timestamp and actions (Keep, Skip, Detail, Save, Retailer Click). Distinguish verified purchase from self-reported purchase. Exclude app-background time from dwell. Retry offline with idempotent event IDs. Make event retention and delete-account behavior explicit. Keep personal data minimal and avoid invasive inference.

### P2 — Per-swipe mobile computational cost

`fitPreferences()` constructs a dense Hessian of size `(feature_count+1)^2`, runs Newton iterations, and computes inverse-diagonal uncertainty by repeated linear-system solves. `useDeck.swipe()` rebuilds the taste model after every swipe and re-ranks the remaining deck. This may be entirely acceptable with today's small feature vocabulary; it can become a performance issue with finer-grained tags or embedding dimensions. Do **not** feed raw high-dimensional image embeddings into that dense per-user solver.

**Remedy:** separate compact interpretable attributes from high-dimensional vector similarity; precompute embeddings and use vector retrieval, low-dimensional user centroid/contrastive vectors, incremental feature statistics, snapshot caching, and/or server-side ranking. Keep 1–2 visible cards pinned so animations do not jump. Benchmark on a budget Android device, both online/offline, with 1k/10k/100k-item catalogs.

### P2 — Brand/retailer affinity can oppose hidden-gem discovery

Brand and retailer currently influence model features (weights 0.7 and 0.25). Large stores may get repeated exposure, creating self-reinforcing brand affinity even when the user is reacting to design, not the store. Retain retailer as a trust/availability/price dimension, but test removing or strongly capping it as a **taste** feature. Enforce reasonable merchant exposure diversity and dedupe identical products sold by different stores. Never let affiliate payout distort relevance without transparent, clearly separated sponsorship.

## 4. Target architecture

### A. Catalog intelligence, nightly offline job

1. Import and normalize retailer feed; validate URLs/active state, identify stable product and variants, basic quality gate.
2. Verify product type and facts from feed, capture size, dimensions, color variants, price, currency, materials, stock where offered.
3. Analyze primary product image and selected supplemental images with a multimodal model; output schema-constrained visual attributes with `confidence`, `source=image|text|retailer`, and `model_version`.
4. Compute image or multimodal embedding using a **single selected embedding model** and record dimension/version/hash; never silently mix vector spaces from different models.
5. Store enriched records in a separate table (`product_intelligence`) keyed by product and enrichment version; use pgvector for similarity search, appropriate filtering indexes, and a human-QA holdout set.
6. Incrementally reprocess only changed product imagery/descriptions to control cost.

Suggested controlled vocabulary (extend via QA): primary/secondary colors, finish warmth, silhouette shape, edge shape, leg/base design, visual mass, texture, wood appearance, upholstery treatment, pattern density, statement-vs-subtle, vintage-vs-contemporary, material look and verified material as distinct fields.

### B. Three-tier preference model

- **Global:** long-lived, low-reactivity aesthetic vector + interpretable attribute preferences across furniture types.
- **Product type:** category-specific visual prototype(s), positive and negative signals, shrunk toward global when uncertain.
- **Mission:** per-shopping-goal budget, dimensions, style hints (optional), short-term visual preferences, saved finalists and skip patterns.

Implement a multi-modal taste representation rather than one averaged vector: distinct liked clusters (e.g., minimal oak *and* ornate walnut) should both survive. Use negative exemplars carefully—Skip is an ambiguous signal, not definitive dislike for every feature.

### C. Candidate retrieval and ranking

Candidate generation should draw from several non-overlapping routes: nearest visual matches to **multiple positive taste clusters**; new styles adjacent to those clusters; predicted high-value pieces from compact attributes; deliberately diverse/informative probes; and high-quality underexposed merchants. First apply eligibility/category, active status, hard stated constraints, duplicate grouping, minimum trust/quality, and previously swiped exclusions as appropriate. Optional budgets must be honored as hard filters when explicitly set, not inferred ceiling from past keeps alone.

Suggested conceptual scoring (weights not predetermined):

`final_score = visual_affinity + attribute_affinity + mission_fit + quality + calibrated_exploration - repetition - constraint_violations`

Use MMR or equivalent re-ranking for the **first 10–20 visible cards**, considering near-duplicate/variant and shape similarity. Control retailer and price diversity. No fixed threshold or weights should be considered production-ready before experiments.

Serve recommendations as compact cards with stable `request_id`, `policy_version`, product ID, reason codes, and cursor. Preserve pinned card behavior, swipe/undo, product detail, Keep, and affiliate handoff.

### D. Observability, validation, and privacy

Log impressions only when actually shown; correlate subsequent actions with impression IDs. Track item price/version at exposure to avoid judging past sessions against today's feed. Capture optional post-discovery "Would you have found this elsewhere?" feedback sparingly. Plan user consent, data export/deletion, appropriate retention, and opt-out of behavioral personalization. Protect server keys and never embed merchant credentials on-device.

## 5. Evaluation plan: the Engine Lab

**Offline harness** using catalog snapshots and repeatable seeds:
- Baseline V2 against simple popularity/quality, content-only, and V3 ablations.
- First-20 coverage, visual cluster variety, low-quality exposure, duplicates, price violations, eligible catalog recall, time and memory.
- Scenario: 3,000 nightstands, hidden ideal below initial top 300; engine must have a chance to surface it.
- Scenario: same attributes but meaningfully different appearance; visual similarity should distinguish them.
- Scenario: user prefers different aesthetics for sofas and nightstands.
- Scenario: false tags, out-of-stock products, wholesale brand imbalance, near-duplicate variants.
- Scenario: changing mission, no onboarding, 1 keep, 10 skips, undo, reset, offline reconciliation.

**Real-user research (first ~10–20 testers):** Observe the actual first-20 swipe journey, capture subjective match quality and breakthrough favorites, and record whether users discovered products or brands they did not know. Counterbalance feed versions where possible; avoid novelty bias.

**North star:** mission success: user identifies and saves a product they would seriously consider buying, optionally following through to a valid retailer page, with reported discovery value. Supporting metrics: first satisfying find, qualified retailer clicks, real catalog coverage, meaningful unique styles, merchant diversity, revisit for a new mission, p95 rank latency, zero invalid-constraint recommendations. Do not optimize raw swipe count or raw affiliate payout as success proxies.

## 6. Build sequence with file-level targets

### Milestone 0 — Preserve and instrument V2

- Create a branch and baseline test artifacts. Leave current UI untouched.
- Add regression tests for catalog >1,000, excluded IDs, hidden/active items; fix [`SupabaseProductRepository.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/data/SupabaseProductRepository.ts) / [`ProductRepository.ts`](https://github.com/devinbradford/shoppingswipe/blob/main/src/data/ProductRepository.ts) with paginated candidate retrieval.
- Add event/exposure schemas and safe local buffering; extend `useDeck` minimally.
- Measure real on-device per-swipe model fit and rank times before optimization.
- Run `npm run check` and `npx expo lint` on each change; compare to baseline.

**Exit gate:** No catalog truncation, no regression in swiping or saved items, tracking tests pass, baseline recorded.

### Milestone 1 — Product Intelligence V1

- Pilot attribute enrichment and embedding extraction with manual golden set.
- Add versioned `product_intelligence` table and optional vector indexes; never break older product rows.
- Provide fallback behavior when enrichment missing or stale; no external AI calls in swipe path.
- Include product and image hash/version for reproducible evaluations.

**Exit gate:** Demonstrated meaningful visual distinctions on labeled test pairs, enrichment cost measured, no material/stock hallucination presented as retailer fact.

### Milestone 2 — Retrieval V3 behind a flag

- Add pure TypeScript `src/recommendation/v3/` modules (types, candidateMixer, rank, diversity, tasteScopes, reasons). Keep existing V2 untouched as baseline.
- Build the paginated or vector-enabled candidate retrieval in a backend adapter, separate from pure scoring code.
- Support transparent mode switching (`v2` / `v3`) and safe fallback.
- Use independent discovery channels, global/type/mission preferences, calibrated novelty.

**Exit gate:** All earlier tests pass; lab shows improved discovery and no material rise in unsuitable/duplicate products.

### Milestone 3 — User learning and experiments

- Run controlled opt-in tests, adjust parameters based on actual outcomes.
- Sync durable signals and manage data privacy; validate cross-device model results.
- Compare candidate-generation, visual model, contextual learning, and diversity independently with ablation tests.
- Add dashboard for time to first satisfying find, qualified click, unknown-brand discovery, and retrieval coverage.

**Exit gate:** Real evidence that users find good products faster or discover better unexpected items than with V2, without slower swipes.

## 7. Design and implementation guardrails for Claude/Codex

1. Read `AGENTS.md` and `CLAUDE.md`; preserve Expo SDK 58 dependency compatibility and pure TS recommendation boundaries.
2. Never replace V2 until the candidate V3 passes side-by-side tests.
3. Do not touch welcome, onboarding visuals, typography, product images, tabs, or affiliate URLs unless explicitly required by an approved integration change.
4. Schema migration requires review and must not delete existing swipe/user data.
5. AI inference runs **offline in trusted ingestion jobs**, not on every swipe. Store source and confidence separately from retailer-verified facts.
6. Treat user clicks as engagement, not as proof of conversion; treat self-reported purchases separately from verified purchases.
7. Support anonymous local discovery, offline behavior, and graceful no-enrichment fallback.
8. Make model and catalog versions visible in diagnostic logs and evaluation, not in consumer UI.
9. Require passing typecheck, Jest, lint, and device smoke tests before merging.
10. Include rollback flag and versioned response contract for every production V3 rollout.

## 8. Suggested first engineering ticket (smallest useful step)

**Ticket: Fix candidate eligibility and catalog coverage before modeling changes.**

**Files to inspect:** `src/data/ProductRepository.ts`, `src/data/SupabaseProductRepository.ts`, `src/hooks/useDeck.ts`; related Jest tests.

**Goal:** For a 3,000-product test catalog, every eligible unswiped product is addressable through cursor-based candidate acquisition, and no arbitrary first-1,000 ID boundary hides items. Preserve current UI/swipe and store interfaces if possible. Do not alter recommender mathematics in the same pull request.

**Acceptance tests:** 3,000 items with >1,000 already swiped; product at index 2,800 remains eligible; no duplicates between pages; correct active/category/price filters; deterministic snapshots; no unbounded full catalog download on mobile; matching local repository behavior where applicable.

**Implementation order:** Add failing tests → design repository pagination contract → query/index implementation → useDeck integration/fallback → run checks → report query count and latency on representative data.

---

**Verification limits:** This audit is grounded in publicly readable GitHub source and documentation at the time listed above. I could not clone the repository or run the actual Jest suite in this environment, and I did not access the live Supabase data. Issues are code-derived and should be reproduced in test before fixes are merged; documented feed/test counts are not independent live validation.

## 9. Status log

### Phase 1 — Learning-data integrity (November 2026, implemented)

Two defects confirmed with deterministic tests before fixing:

1. **History for inactive products was dropped.** The taste model reads product attributes from the catalog, and the catalog only returns active products, so every swipe and signal on a switched-off product silently stopped counting (a shopper with 6 walnut keeps went back to cold start once those products were switched off). Fixed with on-device historical product facts (`productFactsStore`, `historicalFacts.ts`): saved when a swipe is recorded and backfilled from every live taste lookup; merged in `currentTasteModel` with live records always taking priority. Facts carry `featureVersion` so V3 visual attributes can coexist with v1 text attributes.
2. **Undoing the only swipe wiped all signals and Your taste answers** (a store subscription fired whenever the swipe list became empty, which also caught a sync with no swipes). Removed; signals are cleared only by explicit operations through `localLearningData.ts` (sign-out, account deletion, Profile → Reset, another account syncing onto the phone). Onboarding answers were never affected.

Decisions V3 inherits:
- Learning never depends on what the catalog has *today*: candidates come from the live catalog; evidence uses live records plus saved facts.
- Lifecycle operations (Reset, Start fresh, sign-out, account switch, Undo) are explicit, with defined effects per store; no implicit cross-store side effects driven by counts.
- Onboarding priors, behavioural events and explicit feedback stay separate, each with its own reversal rules.
- Products are deactivated, never deleted (deletes cascade to the account's swipes).

Limits that need the server-side event pipeline (Milestone 3): products that went inactive before Phase 1 shipped and were never seen live on that phone; learning on a second phone (signals and facts are on-device only); hard-deleted products.

