# Visual evaluation method (V3 Milestone 1, Stage 1)

This document covers the evaluation infrastructure for checking whether an image model judges furniture design the way people do. It applies to Stage 1 only:

- no retailer image has been opened, downloaded or embedded;
- no model has been run on catalog data;
- no app code, ranking, learning, sampling, UI, schema or affiliate link has changed.

Related documents:
- Plan: `docs/VISUAL_INTELLIGENCE_M1_PLAN.md`
- Rater guide: `docs/vision/LABELING_PROTOCOL.md`
- Image rights: `docs/vision/IMAGE_PERMISSIONS.md`
- Model environment: `tools/vision-models/README.md`

## 1. What was built

| Piece | Where | Tested by |
| --- | --- | --- |
| Schemas: manifest, questions, answers, export format (versioned) | `src/vision/schema.ts` | `validateExport` tests |
| Related-product grouping and group-level split | `src/vision/grouping.ts` | union-find, transitivity, 25-catalog no-leak property test |
| 200-product sampler (seeded) | `src/vision/sampling.ts` | determinism, quotas, store cap, partners, no leaks |
| Manifest build, canonical JSON, validation | `src/vision/manifest.ts` | hash/tamper/leak detection |
| Agreement: majority with "ambiguous", Fleiss κ, Krippendorff α | `src/vision/agreement.ts` | known values, missing data, ordinal vs nominal |
| Metrics: triplet accuracy, Spearman, pooled P@k/nDCG bounds, AP, dev-set threshold, cross-store ratio | `src/vision/metrics.ts` | hand-checked examples |
| Pooled relevance candidates | `src/vision/pooling.ts` | equal depth, same split and type only, random and same-group additions, determinism |
| Calibration analysis and workload | `src/vision/calibration.ts` | traps, attention checks, warnings, minutes |
| Evaluation runner and test-split lock | `src/vision/evaluate.ts` | split filtering, mixed-split exclusion, lock rules |
| Synthetic world and drawn-furniture practice pack | `src/vision/fixtures.ts`, `src/vision/fixtureArt.ts` | determinism, balanced answers, trap colours |
| Commands | `scripts/vision/*.ts` (`npm run vision:*`) | run end to end (below) |
| Annotation tool (one local HTML file) | `tools/annotate/index.html` | browser-tested: full pack, resume after reload, export, phone width |
| Model pilot harness (Python, isolated) | `tools/vision-models/` | `--self-test` (no downloads) |

All of `src/vision` is pure TypeScript. It has no React, no network access and no app imports, and nothing in the app imports it.

## 2. Related-product grouping (leakage control)

**Problem.** The same design often appears several times in the catalog:
- as several colour or size listings on one store page;
- as listings that share one photo (145 photos are shared across 380 products);
- under different addresses.

If one copy is in the development set (used to choose models, prompts and thresholds) and another copy is in the protected test set, the test score is inflated. The model has effectively already seen the answer.

**Algorithm** (`groupRelated`, union-find over the whole catalog, not just the sample). Two products are joined when any of these holds:

| Rule | Key | Stage |
| --- | --- | --- |
| Same photo | photo address, lower-cased, without query string (`?v=` cache versions collapse) | 1 |
| Same image content | `imageHash` (a perceptual hash, computed only once image use is approved) | 2 |
| Same retailer page | store host + page path of the real product page. Affiliate links are decoded from Awin's `ued` parameter and `?variant=` is dropped, so colour and size variants of one design join. | 1 |
| Confirmed duplicate | id lists that a person confirmed are the same product under different addresses (`--duplicates`) | 1–2 |

The rules are transitive: if A and B share a photo, and B and C share a page, then A, B and C form one group. Group ids are `g:<smallest member id>`, so they are stable.

**Split** (`splitByGroup`):
1. Whole groups are assigned, never single products.
2. Within each product type, groups are put in a seeded order. A group goes to test if that brings the type's test count closer to 60% of its sampled products.
3. 60/40 is a **target**; isolating groups comes first. Dining chairs (4 sampled products in 2 groups) ended up 0 dev / 4 test.

**What "no leakage" means and how it's checked:**
- `findLeaks(groups, split)` lists every group with sampled members on both sides; it must be empty.
- `checkManifest` re-checks the leak test, the hash and partner consistency whenever the manifest is read (`npm run vision:sample -- --verify`).
- Every question is assigned a side with `questionSplit`, and any question that mixes sides is dropped and counted.
- Retrieval candidates are drawn only from the query's own split.
- Tests:
  - a property test over 25 random catalogs with injected shared photos;
  - a forced bad split is detected;
  - a mixed question is rejected;
  - the evaluator drops mixed questions.
- **Unsampled relatives** of a test product are listed in the manifest's `groups`. They inherit the protection: they must not be used for tuning either (166 catalog products are test-protected in total). Stage 2 tuning must exclude every member of a test group, not just the sampled ones.

**Known limit.** In Stage 1 the only grouping signals are addresses and pages. Identical photos re-uploaded under different addresses, and the same design sold by two stores, can only be found from image content (Stage 2 perceptual hash) or by people (same-thing checks). Rule for Stage 2: run the hash and the human duplicate review **before** any test-set scoring. If either joins products across the split, build a new manifest with the duplicates as input (new hash). The test-run log is keyed by manifest hash, so earlier results cannot be mixed in.

## 3. The manifest

Command:

```bash
npm run vision:sample -- --snapshot part0.json --snapshot part1000.json --snapshot-date 2026-11-09 --photo-meta meta.json
```

It writes `data/vision-eval/manifest.json` (145 KB).

**Input:** the 9 November 2026 catalog snapshot: 1,937 active products from Tribesigns, Sicotas and Welax. `.env` isn't available in this checkout, so the live catalog wasn't read; the snapshot date is recorded in the manifest. Photo kind comes from the 172 earlier measured photos, where available.

**Contents:** ids, store id, room, type, tags, material, colour, the first photo's **address**, the store page path, group id, split, hard-case flags, why each product was sampled, and the groups. It contains no images, no affiliate links and no prices.

**Reproducibility:**
- The seed is `20261113`.
- `canonicalJson` sorts keys at every level, and the hash is SHA-256 of the canonical body.
- Two runs from the same snapshot gave byte-identical files (file SHA-256 `d20fcfb5…`, manifest hash `d711082b606a1c571b1400037afee57d9e9f4c4f0968d66a6dd7a6ba65a73140`).

Validation output, from `npm run vision:sample -- --verify`:

```
manifest  200 products  dev 76 / test 124  (target test share 0.6)
groups    150 touch the sample; 63 have related products; 37 have 2+ sampled members
          joined by: same-retailer-page 63, same-photo-url 22
by type   accent-chairs 3/4  bar-stools 1/3  bed-frames 1/2  coffee-tables 8/12  dining-chairs 0/4  dining-tables 14/20
          dressers 7/11  nightstands 20/31  rugs 6/10  sofas 6/12  tv-stands 10/15
partners  18 (12 colour-variant, 6 same-photo)   hard cases 123
leakage   0 groups on both sides
valid     hash matches, no leakage, partners consistent
```

**Breakdown:**
- **Stores:** Tribesigns 103, Sicotas 76, Welax 21. No store exceeds 60% of a type when another store sells it.
- **Hard cases:** default "modern" 61, no material 55, shared photo 39, "multi" colour 22.
- **Photo kind:** 29 cut-outs, 19 room photos, 152 not yet measured.

## 4. Metrics

All metrics report bootstrap 95% intervals using the Engine Lab's `estimate`. Each split is scored separately.

**Triplets: accuracy against the human majority.**
- A triplet is *ambiguous* when there's no majority above 50% or most raters answered "can't tell". Ambiguous items are excluded and counted, never scored.
- Results are also reported per stratum: colour trap, photo trap, studio vs room, and so on.

**Pairs:** Spearman correlation between the mean 1–5 rating (at least 2 raters) and cosine similarity.

**Same design:**
- average precision of the cosine score against the human majority;
- a threshold is chosen on **dev** (best F1) and applied unchanged on test.

**Retrieval: pooled judgments, never "unlabelled = irrelevant".**
- **Pool per query** (`buildPool`): the union of
  - the top-10 of **every** system being compared, all at equal depth (text-only baselines included);
  - 5 random candidates;
  - every same-group product.

  The pool is limited to the query's own split and product type. People judge every pooled pair 0–3, and a pair's grade is the median of at least 2 raters, rounded down. A pair that can't be aggregated stays **unjudged**, not 0.
- **Reported per system:**
  - **judged@k**: the share of its top k that people judged;
  - **P@5 and nDCG@10 as bounds**: *lower* counts unjudged items as not relevant, *upper* counts them as relevant. The gap is the uncertainty caused by missing judgments;
  - **condensed** scores, with unjudged items removed;
  - **pooled recall@10**: relevant items found ÷ relevant items *the pool* found. It is explicitly not recall over the whole catalog, because the full candidate universe is never judged.
- **Coverage:** below 90% judged@k the report says **LOW COVERAGE**, and the condensed numbers are not quoted as results.
- **Adding a system later:** its top-10 must be pooled and judged first. The fixture run shows what happens otherwise: an unpooled system gets P@5 bounds of 27–32% instead of one number.
- **Pool size:** `poolContribution` shows how many pairs each source added and how many only that source found. If random candidates keep finding relevant items, the pool is too shallow.

**Store shortcut:** for each query, the cross-store ratio is the other-store share in the model's top 10 divided by the other-store share among items people judged relevant. A ratio of about 1 means no store bias. Below 1, the model prefers the query's own store more than people do, for example by recognising the photography rather than the design.

## 5. Protecting the test split

- **Dev only** for model choice, prompt wording, thresholds, preprocessing, and every repeated comparison. Test packs are labelled like dev packs but have `purpose: "test"`.
- `npm run vision:evaluate -- --split test …` checks the following:
  1. It refuses to run without `--reason` saying what was frozen on dev.
  2. It requires `--thresholds <dev report>`, so thresholds can't be re-chosen on test.
  3. It scores each (manifest hash, system) pair **once**. A repeat is refused unless `--force` is given, and the repeat is also logged.
  4. Every attempt is appended to `data/vision-eval/test-runs.json` with time, systems, a hash of the inputs and the reason. The log is committed, so repeated looks at the test set are visible in history.
- Fixture mode never touches the lock.

## 6. Commands (all run here on synthetic data or metadata only)

| Command | What it does | Verified |
| --- | --- | --- |
| `npm run vision:sample -- --snapshot … --snapshot-date …` | builds the manifest | yes, twice, identical |
| `npm run vision:sample -- --verify` | re-checks hash, leakage and partners | yes |
| `npm run vision:fixture-pack` | writes the 28-question practice pack (our own drawn SVG furniture) | yes |
| `npm run vision:calibration -- --simulate` | dry run of the calibration analysis with 4 simulated raters | yes |
| `npm run vision:calibration -- --pack … --labels <dir>` | analyses real rater exports | yes, on a browser-produced export |
| `npm run vision:evaluate -- --fixture` | the whole pipeline on synthetic data: sample → split → pack → simulated raters → pool → dev → test | yes |
| `npm run vision:evaluate -- --split dev\|test …` | real evaluation (needs Stage 2 embeddings and labels) | input checks only |
| `python tools/vision-models/measure_models.py --self-test` | model-harness check | yes |

Fixture-mode result: the "design" stand-in clearly beats the "store-biased" and "text" stand-ins on every metric (for example test triplets 83% vs 55% vs 47%). Only the store-biased one shows a cross-store ratio below 1 (0.62). This is the behaviour the metrics are meant to detect. **These numbers say nothing about real models.**

## 7. Acceptance criteria (revised; all numbers provisional)

Each bar is fixed **after** the calibration round and before any test scoring, and recorded in this file with a date. A bar is never moved after the test results are seen.

| Metric | Provisional bar | What changed from the plan, and why |
| --- | --- | --- |
| Triplet accuracy (test, unambiguous) | ≥ 0.80 **and** within 10 points of the human ceiling (mean leave-one-rater-out agreement with the majority) | Unchanged. If the human ceiling is below 0.85, the bar becomes "within 10 points of the ceiling" only. |
| Beats words | triplet accuracy − best text-only baseline ≥ +0.10, with the lower 95% bound of the paired difference > 0 | Requires the gain to be statistically clear, not just the point estimate. |
| Rating correlation | Spearman ≥ 0.50 | Only if the 1–5 ratings reach α ≥ 0.6 in calibration; otherwise reported but not used as a gate. |
| Retrieval | P@5 lower bound ≥ 0.55 **and** condensed P@5 ≥ 0.60; nDCG@10 condensed reported; judged@10 ≥ 90% for every system compared | Was "P@5 ≥ 0.60" with unjudged items silently counted as misses. Now bounds plus coverage. "Recall@10" is renamed pooled recall@10 and has no bar, because recall over a partly judged catalog would overstate certainty. |
| Near duplicates | same photo: AP ≥ 0.99; same design / other colour: AP ≥ 0.90; threshold from dev | Unchanged; the threshold is now enforced by the tool. |
| Store shortcut | cross-store ratio ≥ 0.8 (lower bound reported) | Same idea, now defined per query against human-relevant items. |
| Photo-style robustness | photo-trap and studio-vs-room accuracy ≥ 0.70 and within 10 points of same-style questions | Uses the trap stratum built for calibration. |
| Hard cases | accuracy on hard-case items reported separately; no more than 10 points below overall | Unchanged. |
| Attributes | per attribute; used only where human α ≥ 0.6 | Unchanged. |
| Failure analysis | the 20 worst misses, sorted by cause | Unchanged; needs Stage 2 images. |
| Cost | measured by `measure_models.py --measure` before any catalog-scale run | Not yet measurable here (see the model README). |

**Sample-size caveat.** With 124 test products, about 150 test triplets give an interval of roughly ±6–7 points around 80%. Two models less than about 8 points apart should be called a tie unless the paired comparison says otherwise.

## 8. Reproducibility settings

- Seeds:
  - sampler `20261113`;
  - split `split:<seed>:<type>`;
  - pool `pool:<seed>:<query>`;
  - bootstrap 17;
  - practice pack 1.
- Each rater gets their own question order and left/right swaps from `hash(pack id + rater code)`, and `swapped` is stored with every answer. Answers are stored un-swapped, so position bias can be audited.
- Snapshot date, product count, seed, quotas and test share are inside the hashed manifest.
- Model environment: pinned Python packages; model revisions are recorded per run (`models.lock.json`); CPU, a fixed thread count, deterministic torch algorithms. Run-to-run differences are measured, not assumed.
