# CureAvo Discovery Engine V3 — Milestone 1: Visual Intelligence Foundation

**Status: PROPOSED, awaiting approval.** Nothing in this plan has been built.
**Prepared:** November 13, 2026 · **Baseline:** [ENGINE_LAB_BASELINE.md](ENGINE_LAB_BASELINE.md) (V2, commit `50baaf7`)

This plan describes how CureAvo would learn to see furniture (silhouette, proportions, curves, visual weight, finish, texture, design language) and how we would prove that it works, before any of it touches the app. No production code, schema, UI, candidate selection or affiliate behaviour changes in Milestone 1. No paid API is called, and no full-catalog processing happens without approval.

## 1. Real-catalog image audit

**Sources (no new bulk downloads):**
- The live catalog snapshot read on November 9 with the publishable key (1,937 active products).
- The combined Awin Google-format feed (8,888 variant rows).
- The photo measurements of a 172-product stratified sample taken on November 10 for Step 1.
- A new 30-image sample (10 per store), originals fetched only to read size and format; nothing kept.

The live catalog may have changed since November 9; the pilot re-reads it.

### 1.1 What we have

| Fact | Value |
| --- | --- |
| Active products | 1,937: Tribesigns 1,139 (59%), Sicotas 760 (39%), Welax 38 (2%) |
| By type | dining tables 595 · nightstands 478 · TV stands 352 · dressers 177 · coffee tables 152 · rugs 130 · sofas 35 · accent chairs 7 · dining chairs 4 · bar stools 4 · bed frames 3 |
| Products with a usable image | 1,937 (100%) |
| Images stored per product | **exactly 1** (the importer keeps the first) |
| Host | 100% Shopify CDN (`cdn.shopify.com`), public, no authentication |
| URL formats | .jpg 97%, .webp 2%, .png 1%. The CDN served JPEG even for .webp addresses in the sample |
| Original resolution (30-image sample) | All square, 1,000–3,200 px. Sicotas 2,000 px; Tribesigns mostly 1,800 px; Welax 1,000–2,048 px. Median file 197–653 KB |
| Smaller copies | Available on request from the CDN (the `width` parameter the Step 1 photo measurer already uses), so models can read 256–512 px copies (~20–60 KB) instead of originals |

### 1.2 What the feed offers beyond what we store

- The feed has **one photo per variant row**: 8,888 rows give 6,884 distinct photos. The extra-photo and lifestyle-photo columns are empty for all three stores.
- Because the importer groups variants by product page and colour, **about 25% of product groups (1,112 of 4,381) have 2–6 distinct photos across their size variants. The importer keeps only the first.** Keeping them would give the model more views per product, but that's an importer change, outside this milestone.
- The feed's material, pattern and dimension columns are **0% filled** for all three stores. Proportions and dimensions are not available as facts at all.

### 1.3 Studio versus room photography

From the 172-product sample measured on November 10, using the existing photo measurer: **38% studio cut-outs, 62% room or lifestyle scenes.** Photo style is almost entirely determined by the store:

| Store | Cut-out | Room scene |
| --- | --- | --- |
| Tribesigns | 0% | **100%** (85/85) |
| Welax | **92%** (23/25) | 8% |
| Sicotas | 69% (43/62) | 31% |

By type: sofas and accent chairs are nearly all cut-outs; rugs, dining tables and bar stools are all room scenes.

**This is the biggest technical risk in the milestone.** An image model can learn "white background → Welax-like, room scene → Tribesigns-like". That's a store and photography shortcut, not taste, and it would *suppress* cross-store discovery. The evaluation is designed to catch it (sections 3 and 6).

### 1.4 Duplicates and variants

- **Same photo used by more than one product:** 145 photos shared by 380 products (20% of the catalog), mostly colour or size variants without their own photo.
- **Product pages with more than one product (colour variants):** 387 pages, holding 1,111 products (57%), up to 10 per page.
- **Implication:** near-duplicate handling must work on two levels. *Same photo* is detectable by URL and perceptual hash. *Same design, different colour* needs visual similarity plus the page grouping. The Engine Lab's S10 showed V2 repeats a recent design on 37% of cards when variants exist.

### 1.5 Existing attributes and their limits

| Field | State |
| --- | --- |
| Style | 577 products (30%) carry only "modern", the importer's default when no style word is found. "Rustic" (823) and "farmhouse" (737) come from keyword rules and are over-applied |
| Material | Empty for 434 (22%). Dominated by steel (596), oak (375), pine (275); finish names often stand in for real materials (Step 5 found "Coastal Oak", "oak-look") |
| Colour | Never empty, but "multi" for 285 (15%), and mapped to a 12-colour palette |
| Description | Always present (median 567 characters), but marketing copy: e.g. a compressed loveseat described as "Soft Sculptural Silhouette" |
| Missing entirely | silhouette, leg or base design, visual weight, proportions, finish sheen, texture, ornament, dimensions |

### 1.6 Store and type are tangled together

Dining tables are 99.8% Tribesigns; dressers are 100% Sicotas; sofas and accent chairs are 100% Welax. **For most types there is only one store**, so "cross-store discovery" can only be measured within the types more than one store sells: nightstands, TV stands, coffee tables, sofas (Welax and Sicotas), dining tables (barely). The sample and metrics account for this.

### 1.7 Image licence and feed-usage constraints (needs your confirmation)

- **Awin's terms:** the Publisher Terms define *Advertiser Materials* to include images supplied by advertisers, and each advertiser's Program Terms can restrict how they're used. Some restrict use to feed content as supplied ([Awin Publisher Terms, Aug 2025](https://www.awin.com/docs.awin.com/Legal/Publisher+Terms/2025/EN-(UK)_Awin-Ltd-Publisher-terms_August-2025.pdf); [example program terms](https://ui.awin.com/merchant-profile-terms/127047/brand)).
- **What I couldn't find** is a clause that explicitly covers computing embeddings (numeric summaries) from feed images for on-site recommendation. This is not legal advice.
- **Before enrichment, please confirm** with Awin and with Tribesigns, Sicotas and Welax (or their Awin program terms) that analysing feed images to recommend their products inside CureAvo is permitted.
- **Proposed safeguards regardless:**
  - never commit or redistribute images;
  - cache small copies only temporarily in the job;
  - store only derived vectors and labels;
  - never send retailer images to a third-party API without the advertisers' written OK.
- **Room photos:** the 8 onboarding room photos (`assets/rooms`) are a separate licence question, already on your list.

## 2. The 200-product visual evaluation dataset

### 2.1 Sampling specification (reproducible)

- **Universe:** active products in the latest catalog snapshot.
- **Seed:** `20261113`.
- **Algorithm:**
  1. **Type quotas** (182 products): nightstands 40, dining tables 28, TV stands 24, dressers 18, coffee tables 20, rugs 16, sofas 18, accent chairs 7 (all), dining chairs 4 (all), bar stools 4 (all), bed frames 3 (all). This deliberately over-weights the core nightstand journey and under-weights dining tables relative to the catalog.
  2. **Within each type,** a seeded shuffle, then greedy selection that penalises an already-chosen store, style tag and colour. **No store may exceed 60% of a type** when another store sells it.
  3. **Hard-case floor:** at least 30% of each type's picks have at least one of: "modern"-only style, no material, "multi" colour, or a photo shared with another product.
  4. **Pair partners** (18 products): 12 *colour-variant* partners (same product page, different colour, different photo) and 6 *same-photo* partners.
  5. **Photo-style balance (needs approval to measure):** measure the photo type (cut-out or scene) of a 2× oversampled candidate pool with the existing measurer at 256 px. Then re-run step 2 with photo type as a further stratum, aiming for at least 35% of each where the type allows.
- **Output:** a manifest with id, photo URL, type, store, tags, hard-case flags, photo type, pair links, split assignment, and a SHA-256 of the manifest.

### 2.2 Dry run on the November 9 snapshot (catalog details only, no images)

| | Sample | Catalog |
| --- | --- | --- |
| Products | 200 | 1,937 |
| By store | Tribesigns 101 (50%) · Sicotas 78 (39%) · Welax 21 (11%) | 59% · 39% · 2% |
| By type | nightstands 53 · dining tables 33 · TV stands 24 · coffee tables 20 · dressers 18 · sofas 18 · rugs 16 · accent chairs 7 · dining chairs 4 · bar stools 4 · bed frames 3 | see 1.1 |
| Style tags | all 12 present ("modern" 79, rustic 46, minimal 39 … scandinavian 4) | |
| Colours | all 12 palette colours | |
| Hard cases | 124 products: default "modern" 60, no material 55, shared photo 39, "multi" 20 | |
| Pairs | 12 colour-variant, 6 same-photo | |
| Photo type already known | 47 (30 cut-out, 17 scene); the rest measured in step 5 | |

### 2.3 Split

- **Development set: 80 products** (40%). Used to compare models, image preparation (full photo vs cut-out crop) and thresholds.
- **Held-out test set: 120 products** (60%). Assigned by seeded hash, stratified by type and store.
- **Locking the held-out set:** its manifest hash is committed before any model is run on it, and each finalist is evaluated on it **once**. Pair and triplet questions are split the same way: a question belongs to the test set if any of its products does.

## 3. Human-labelling protocol (independent ground truth)

**Raters:** at least 3 independent raters. Proposed: you plus two people outside the project. Each rates everything, separately, without seeing the others' answers.

**Blinding:**
- Photos only: no title, store, price or tags.
- Left and right positions and question order are randomised per rater.
- Each photo is shown as a 512 px copy, with the product fully visible.

**Tasks (about 2½–3 hours per rater over 2–3 sittings):**

| Task | What the rater does | Volume |
| --- | --- | --- |
| A. Triplets | "Which of B or C looks more like A, in overall design?" Answers: B / C / can't tell, plus confidence 1–3 | ~300 |
| B. Pair rating | "How alike do these two look, as furniture design?" 1 (nothing alike) – 5 (could be the same design) | ~300 |
| C. Same-thing check | "Same photo? Same design, different colour? Same design, different photo? Different designs?" | ~80 |
| D. Appearance attributes per product | silhouette (rectilinear / softened / rounded / sculptural), visual weight (light & leggy / medium / heavy & grounded), base (legs / plinth / sled / pedestal), finish (matte / satin / gloss), wood tone (light / mid / dark / none), texture (smooth / woven / tactile / upholstered), ornament (plain → decorative, 1–4), design-language words (controlled list + free text), photo type, "whole product visible?" | 200 products |

**Strata for pairs and triplets.** Each stratum has at least 30 items, from metadata and human choice, never from one model's top results:
- similar design, different stores;
- clearly different designs, same type;
- similar look, different materials;
- same material, different silhouettes;
- same design, different colours (the colour-variant pairs);
- studio cut-out vs room photo of similar designs;
- exact and near-duplicate photos;
- the same design language across types (e.g. a nightstand and a dresser);
- random pairs, for calibration.

**Keeping the models out of the ground truth:**
- **Candidate pairs come from a fixed mix:** metadata strata, random pairs, pairs hand-picked by raters from browsing, and pooled candidates from *all* candidate models in equal shares (as search-engine evaluations do). No single model sets the questions.
- **No model output is ever used as a label.**
- **Quality checks:** about 10% of questions are gold checks (identical photos; obviously different objects) to catch inattention, and the time per answer is recorded.

**Disagreement and uncertainty:**
- **Agreement measures:** Krippendorff's α (ordinal) for ratings and attributes; Fleiss' κ for triplets.
- **Label:** each item's label is the majority answer with its agreement level. Items with no majority, or mostly "can't tell", are marked *ambiguous*. They're excluded from accuracy and reported separately.
- **Human ceiling:** the human-vs-human agreement is reported, and no model is expected to exceed it.

**Tooling:** a small private labelling page (a claude.ai artifact with a shared database, so each rater's answers are stored and exportable), or a spreadsheet. Labels export to `data/vision-eval/labels/*.json` in the repo. No images go into the repo, only ids and photo URLs.

## 4. Embedding model options

All candidates run offline in a background job, never during a swipe.

| Option | Licence | Size / vectors | Strengths | Concerns |
| --- | --- | --- | --- | --- |
| **SigLIP 2 base** (`google/siglip2-base-patch16-224`) | Apache-2.0 ([model card](https://huggingface.co/google/siglip2-base-patch16-224)) | ~375M total; 768-dim | Strong general image-text model; text prompts allow zero-shot appearance attributes ("a curved sofa") | ONNX for SigLIP 2 to be confirmed; SigLIP v1 ONNX ports exist ([Xenova/siglip-base-patch16-224](https://huggingface.co/Xenova/siglip-base-patch16-224)) |
| **Marqo e-commerce B / L** | Apache-2.0 ([card](https://huggingface.co/Marqo/marqo-ecommerce-embeddings-L)) | B: 203M, 768-dim · L: 652M, 1,024-dim | Fine-tuned on product images (Amazon / Google Shopping); likely best at product retrieval and variants | Trained for shopping relevance, which may not equal *aesthetic* similarity; ONNX export needed; L is about 3× slower |
| **DINOv2 base** (Meta) | Apache-2.0 (confirm on the model card) | 86M, 768-dim | Self-supervised and purely visual: strong on shape and silhouette, and near-duplicates | No text side (no zero-shot attributes); may encode backgrounds strongly, which is a risk with this catalog's store-tied photo styles |
| **OpenCLIP ViT-B/32** (LAION) | MIT | 151M, 512-dim | Well-known baseline, fast | Weaker fine-grained similarity |
| Hosted: Google Vertex multimodal embeddings | Commercial | 1,408-dim | No infrastructure | ~$0.0001 per image per third-party price lists ([example](https://costbench.com/software/embedding-apis/vertex-ai-embeddings/)); **unverified**; images leave our control (licence) |
| Hosted: Cohere Embed v4 (images) | Commercial | — | No infrastructure | Token-priced (~$0.12 per 1M tokens per aggregators ([example](https://vercel.com/ai-gateway/models/embed-v4.0/about))); image token counting unverified; same licence concern |
| **Text-only baselines (must beat)** | — | — | V2 tag similarity; the same models' *text* side on title + description | Shows whether pixels add anything over words |

**Each candidate is tested two ways:** on the full photo, and on a *product crop* using the cut-out box the Step 1 measurer already computes. The crop reduces the background and store shortcut. Where a product has extra photos (section 1.2), each photo is embedded and the vectors averaged.

**Recommendation.** Pilot the four open-source models plus the text baselines; no hosted API in Milestone 1. My expectation, to be confirmed by the held-out results, not assumed:
- **Marqo e-commerce B or SigLIP 2 base** as the production vector (768-dim), because both have a text side for appearance attributes and search later.
- **DINOv2** as a candidate second signal for shape and near-duplicates if it clearly wins those strata.
- Hosted options are reconsidered only if all open-source models miss the acceptance criteria and the advertisers permit sending images out.

## 5. Proposed architecture (after Milestone 1, each step approved separately)

```text
Nightly import (GitHub Actions)                      App
  products (retailer facts)  ─┐                         V2 ranking (unchanged, fallback)
                              ├─► visual enrichment ─►  product_visual (AI-inferred, versioned)
  changed/new photos only ────┘   (same runner, CPU)        │
                                  - 512px copy via CDN       ├─► similar_products(id, k, filters)   [SQL, pgvector HNSW]
                                  - embedding (model@ver)    └─► candidates_near(vectors, filters)
                                  - perceptual hash               hard filters first: active, type, room, price, not swiped
                                  - photo type + crop box
                                  - zero-shot attributes + confidence
```

- **Background only.** Enrichment runs after the nightly import, on the same GitHub Actions runner (the model is installed only in the job, as `sharp` is today), and only for new or changed photos. The photo's identity is its URL plus the CDN version parameter plus a content hash.
- **Separate, versioned table** (later migration, needs approval): `product_visual(product_id, photo_url, photo_hash, model, model_version, preprocessing, dim, embedding halfvec(768), phash, photo_kind, crop_box, attributes jsonb, attributes_version, created_at)`.
  - Retailer facts stay in `products`. Everything here is labelled AI-inferred, with source and confidence.
  - A model change writes a new version alongside the old one; vector spaces are never mixed, and the switch is a flag.
- **Retrieval in Postgres** (pgvector HNSW, cosine) through functions that apply hard constraints *first* (active, room, type, price, not swiped) and return ids only. Clients never download the vector table.
- **V2 untouched.** Vectors never enter V2's Bayesian solver. V3 adds a *visual candidate channel* and visual similarity features behind a flag. If enrichment is missing or stale, V2 serves as before.
- **Taste vectors later:** from the embeddings of kept and skipped products (several prototypes per shopper, so two tastes both survive). Built in the Engine Lab first.
- **Historical facts:** `featureVersion` 2 would add the visual-record id, so evidence on products that later go inactive keeps its visual meaning.

## 6. Evaluation metrics and acceptance criteria

All are computed on the held-out 120 products with bootstrap 95% intervals, reusing the Engine Lab's `estimate`.

| Metric | Definition | Proposed bar (confirm after seeing human agreement) |
| --- | --- | --- |
| Triplet accuracy | Model's choice matches the human majority, unambiguous triplets | ≥ 0.80 and within 10 points of human-vs-human agreement |
| Beats words | Triplet accuracy minus the best text-only baseline | ≥ +0.10 |
| Rating correlation | Spearman between cosine similarity and mean human 1–5 rating | ≥ 0.50 |
| Retrieval | Per query: precision@5, recall@10, nDCG@10; relevant = human rating ≥ 4 or same design | P@5 ≥ 0.60 |
| Near-duplicates | Same-design and same-photo detection: precision-recall AUC; threshold set on dev, reported on test | same photo ≥ 0.99; same design / different colour ≥ 0.90 |
| Store shortcut | In the shared types (nightstands, TV stands, coffee tables, sofas): share of other-store products among the top 10 human-relevant neighbours vs among the model's top 10 | model ≥ 0.8× the human share |
| Photo-style robustness | Triplet accuracy on studio↔room questions vs same-style questions | gap ≤ 10 points; studio↔room ≥ 0.70 |
| Unfamiliar styles | Accuracy on the hard subset (default "modern", no material, "multi") and on design languages raters marked as uncommon | reported separately; no worse than 10 points below overall |
| Attribute agreement | Zero-shot silhouette, weight and finish vs human majority | per attribute; used only where α(human) ≥ 0.6 |
| Failure analysis | The 20 worst triplet misses with photos, sorted into: background, photo angle, colour over shape, variant confusion, other | qualitative, required |
| Cost | Seconds per image (CI runner), MB stored, $ per 1,000 products | ≤ 30 min CI time for the full catalog; ≤ $1 per 1,000 products |

**Connection to Engine Lab S06 and S07, without tuning to the synthetic 6-dimension taste model:**
- **New real-catalog scenarios:** after Milestone 1, add `S06-real` and `S07-real` on the real 1,937 products.
- **Taste comes from the human labels, never from the embedding being tested.** For example, a shopper who loves "rounded silhouette + light visual weight", or a design language raters marked as uncommon from a small store.
- **No circularity:** the embedding can only win by agreeing with people, not with itself.
- **Both versions kept:** synthetic S06 and S07 stay too, and a V3 change must improve the real-label scenarios, not just the synthetic ones.

## 7. Costs and technical requirements

| Item | Estimate | Basis |
| --- | --- | --- |
| Photos fetched for the pilot | ≤ 600 copies at 256–512 px, about 25 MB, cached temporarily | 200 products, up to 3 photos each |
| Model compute (pilot) | Minutes per model on a laptop or CI runner; 4 models × 600 photos | ViT-base CPU inference is roughly 0.1–0.3 s per image; **to be measured** |
| Full catalog (later) | ~2,000–6,000 photos per first run, then only changed photos nightly; estimated 10–30 CI minutes | same basis; measured in the pilot |
| GitHub Actions | $0 within the free allowance; beyond it, about $0.008 per Linux minute, under $0.05 per 1,000 products | runner time × rate |
| Storage (later) | ~1.5 KB per 768-dim half-precision vector + index → under 20 MB for today's catalog; about 300 MB at 50,000 products × 3 photos | pgvector `halfvec` |
| Hosted alternative (not proposed) | ~$0.10–$0.50 per 1,000 photos (unverified list prices), plus licence risk | section 4 |
| Human labelling | 3 raters × 2½–3 h (free if you and volunteers; ~$15–25/h if paid) | section 3 volumes |
| New dependency (pilot only) | `@huggingface/transformers` (ONNX runtime for Node), a development and CI dependency only, never in the app bundle. Python `open_clip` / `transformers` in the CI job as an alternative | needs your approval |

## 8. Files and infrastructure added in Milestone 1 (on approval)

Milestone 1 is a pilot: no app integration and no production schema.

| Path | Purpose |
| --- | --- |
| `scripts/vision/sample-eval-set.ts` | The seeded sampler in 2.1 (TypeScript port of the dry run) → `data/vision-eval/manifest.json` (+ SHA-256) |
| `scripts/vision/fetch-thumbnails.ts` | Fetches small copies via the CDN `width` parameter into a git-ignored cache; measures photo type with the existing measurer |
| `scripts/vision/embed.ts` | Runs each candidate model (full photo and product crop) → `data/vision-eval/embeddings/<model>@<version>.json` (git-ignored if licence requires) |
| `scripts/vision/evaluate.ts` | All section 6 metrics, dev and test modes, bootstrap CIs; the test mode refuses to run twice for the same model + manifest hash unless forced |
| `src/vision/similarity.ts`, `src/vision/evalMetrics.ts`, `src/vision/agreement.ts` | Pure, tested: cosine and k-nearest neighbours; triplet accuracy, Spearman, P@k, nDCG, PR-AUC; Krippendorff's α and Fleiss' κ |
| `src/vision/__tests__/*.test.ts` | Unit tests on hand-made vectors and labels |
| `data/vision-eval/labels/` | Exported human labels (ids and answers only) |
| `docs/vision/LABELING_PROTOCOL.md` | The section 3 protocol for raters |
| `docs/VISUAL_INTELLIGENCE_PILOT.md` | Pilot results report |
| Labelling page | A private claude.ai artifact with a shared database (not in the repo) |
| `package.json` | Dev dependency `@huggingface/transformers` (if approved) and `vision:*` scripts |

**Later, each step approved separately:**
1. A Supabase migration adding `product_visual`, the pgvector index and the retrieval functions.
2. `.github/workflows/enrich-visual.yml`.
3. Importer change to keep extra variant photos.
4. Engine Lab real-catalog scenarios.
5. The V3 visual candidate channel behind a flag.

## 9. Decisions needed from you

1. **Licence:** confirm with Awin and the three advertisers that analysing feed images for in-app recommendation is permitted (section 1.7).
2. **Approve the pilot:** ≤ 600 small photo copies, 4 open-source models, no hosted APIs.
3. **Dev dependency:** approve `@huggingface/transformers` for scripts only (or prefer Python in CI).
4. **Raters:** you plus two independent people, about 3 hours each.
5. **Acceptance bars** in section 6, to be revisited once human agreement is known.
