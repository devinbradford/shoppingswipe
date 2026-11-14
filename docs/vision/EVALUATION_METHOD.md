# Visual evaluation method (V3 Milestone 1, Stages 1 and 1.5)

This document covers the evaluation infrastructure for checking whether an image model judges furniture the way people do. Since Stage 1.5 that means two separate questions: **structural design** similarity and **overall aesthetic** similarity (see §4 and `LABELING_PROTOCOL.md`). It applies to Stages 1 and 1.5 only:

- no retailer image has been opened, downloaded or embedded;
- no model has been run on catalog data;
- no app code, ranking, learning, sampling, UI, schema or affiliate link has changed.

Related documents:
- Plan: `docs/VISUAL_INTELLIGENCE_M1_PLAN.md`
- Rater guide: `docs/vision/LABELING_PROTOCOL.md`
- Calibration instructions: `docs/vision/CALIBRATION_INSTRUCTIONS.md`
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
| Calibration analysis and workload (per dimension) | `src/vision/calibration.ts` | shape vs colour, finish, photography, contrast pairs, copy rate, attention checks, one- vs two-question timing, minutes |
| Evaluation runner (per dimension, divergent set) and test-split lock | `src/vision/evaluate.ts` | split filtering, mixed-split exclusion, structure-vs-look crossover, lock rules |
| Synthetic world and drawn-furniture calibration pack v2 (finishes, rater copy without key) | `src/vision/fixtures.ts`, `src/vision/fixtureArt.ts` | determinism, 30 judgments, contrasts built correctly, finish never changes the outline, no key in the rater copy |
| Manifest audit (read-only) | `scripts/vision/audit-manifest.ts`, `productNameKey` | grouping re-derivation, same-name families across splits, coverage |
| Commands | `scripts/vision/*.ts` (`npm run vision:*`) | run end to end (below) |
| Annotation tool (one local HTML file; two-answer screens) and the standalone rater file | `tools/annotate/index.html`, `tools/annotate/cureavo-calibration-v2.html` | scripted browser run at desktop and phone width: every intended answer arrives correctly through the real buttons and per-rater swaps; no console errors |
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

**Two dimensions, scored separately.** Every triplet and pair metric is computed twice, once against the human **structure** majority and once against the **overall-look** majority, each with its own ambiguity exclusions. One embedding gives one similarity score, so it can't be right on both whenever people's two answers differ. That is exactly what the evaluation needs to show.

**Triplets: accuracy against the human majority, per dimension.**
- A triplet is *ambiguous* on a dimension when there's no majority above 50%, or most raters answered "can't tell" on it. It is excluded and counted on that dimension only.
- **Divergent triplets** are those where both dimensions have a clear majority pointing to different options. Accuracy on this subset is reported for each dimension and tells us *which* notion of similarity a model follows. On these items a model's two accuracies add up to about 100%.
- Results are also reported per stratum: shape vs colour, finish only, photography, near-identical, and so on.

**Pairs:** Spearman correlation between the mean 1–5 rating (at least 2 raters) and cosine similarity, per dimension.

**Which dimension matters for CureAvo:**
- **Primary:** the overall look, because it is what shoppers respond to. Retrieval relevance is judged on it.
- **Secondary:** structure. It is the diagnostic that shows a model understands design rather than just colour. If a model wins on overall look *only* where colour decides, the text-and-colour baseline could do the same job.

**Fixture check** (synthetic data, not real models): a structure-only stand-in and a colour-aware stand-in cross over exactly as intended.
- Structure triplets: 81% vs 62%.
- Overall look: 69% vs 80%.
- On the 45 divergent items: 67% vs 20% on structure, and 33% vs 80% on overall look.

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

**Retrieval relevance** is graded on the overall look ("would the same shopper like it?"); structure retrieval is not pooled separately (see the protocol, §4).

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
| `npm run vision:audit -- --snapshot …` | read-only audit of the frozen manifest: validity, grouping re-derivation, same-name families across splits, coverage | yes (§9) |
| `npm run vision:fixture-pack` | writes calibration pack v2 (with key, for analysis), the rater copy (no key) and the standalone rater file | yes |
| `npm run vision:calibration -- --labels <dir>` | analyses real rater exports (default pack `calibration-v2.json`) | yes, on browser-produced exports from a scripted run |
| `npm run vision:calibration -- --tool-check` | runs the analysis on scripted answer sheets to check the code (never reported as results) | yes |
| `npm run vision:evaluate -- --fixture` | the whole pipeline on synthetic data: sample → split → pack → simulated raters → pool → dev → test | yes |
| `npm run vision:evaluate -- --split dev\|test …` | real evaluation (needs Stage 2 embeddings and labels) | input checks only |
| `python tools/vision-models/measure_models.py --self-test` | model-harness check | yes |

Fixture-mode result:
- On structure, the "design" stand-in beats the "store-biased" and "text" stand-ins.
- On the overall look, the "colour-aware" stand-in wins, and also wins retrieval (now graded on the overall look).
- Only the store-biased stand-in shows a cross-store ratio below 1 (0.62).

This is the behaviour the metrics are meant to detect. **These numbers say nothing about real models.**

## 7. Acceptance criteria (revised; all numbers provisional)

Each bar is fixed **after** the calibration round and before any test scoring, and recorded in this file with a date. A bar is never moved after the test results are seen.

| Metric | Provisional bar | What changed from the plan, and why |
| --- | --- | --- |
| **Overall-look** triplet accuracy (test, unambiguous): the primary gate | ≥ 0.80 **and** within 10 points of the human ceiling (mean leave-one-rater-out agreement with the majority) | Stage 1.5: the primary target is now the overall look. If the human ceiling is below 0.85, the bar becomes "within 10 points of the ceiling" only. |
| **Structure** triplet accuracy (test) | ≥ 0.75, reported with the divergent-set result | New. A model that passes on overall look but fails structure is probably matching colour, not design. |
| Beats words, on the overall look | overall-look accuracy − best text-and-colour baseline (tags, material, colour) ≥ +0.10, with the lower 95% bound of the paired difference > 0 | The baseline now explicitly includes the catalog colour. Overall look includes colour, which text already knows. |
| Divergent set | reported per dimension; no bar until the calibration shows how often people's answers diverge | New. It shows which kind of similarity each model follows, and guides how the two are combined later. |
| Rating correlation | Spearman ≥ 0.50, per dimension | Only for a dimension whose 1–5 ratings reach α ≥ 0.6 in calibration; otherwise reported but not used as a gate. |
| Retrieval (relevance = overall look) | P@5 lower bound ≥ 0.55 **and** condensed P@5 ≥ 0.60; nDCG@10 condensed reported; judged@10 ≥ 90% for every system compared | Was "P@5 ≥ 0.60" with unjudged items silently counted as misses. Now bounds plus coverage. "Recall@10" is renamed pooled recall@10 and has no bar, because recall over a partly judged catalog would overstate certainty. |
| Near duplicates | same photo: AP ≥ 0.99; same design / other colour: AP ≥ 0.90; threshold from dev | Unchanged; the threshold is now enforced by the tool. |
| Store shortcut | cross-store ratio ≥ 0.8 (lower bound reported) | Same idea, now defined per query against human-relevant items. |
| Photo-style robustness | photo-style and studio-vs-room accuracy ≥ 0.70 on **both** dimensions, and within 10 points of same-style questions | Photography is ignored for both dimensions. |
| Hard cases | accuracy on hard-case items reported separately; no more than 10 points below overall | Unchanged. |
| Attributes | per attribute; used only where human α ≥ 0.6 | Unchanged. |
| Failure analysis | the 20 worst misses, sorted by cause | Unchanged; needs Stage 2 images. |
| Cost | measured by `measure_models.py --measure` before any catalog-scale run | Not yet measurable here (see the model README). |

**Sample-size caveat:**
- With 124 test products, about 150 test triplets give an interval of roughly ±6–7 points around 80% on each dimension.
- The divergent subset will be much smaller (perhaps 30–60 items), so its intervals are wide.
- Two models less than about 8 points apart should be called a tie unless the paired comparison says otherwise.

## 8. Reproducibility settings

- Seeds:
  - sampler `20261113`;
  - split `split:<seed>:<type>`;
  - pool `pool:<seed>:<query>`;
  - bootstrap 17;
  - calibration pack v2 seed 1.
- Each rater gets their own question order and left/right swaps from `hash(pack id + rater code)`, and `swapped` is stored with every answer. Answers are stored un-swapped, so position bias can be audited.
- Snapshot date, product count, seed, quotas and test share are inside the hashed manifest.
- Model environment: pinned Python packages; model revisions are recorded per run (`models.lock.json`); CPU, a fixed thread count, deterministic torch algorithms. Run-to-run differences are measured, not assumed.

## 9. Dataset review (Stage 1.5)

`npm run vision:audit` is read-only; it changes nothing. Results on the frozen manifest `d711082b…`:

| Check | Result |
| --- | --- |
| Manifest validity | Valid: hash matches, 0 groups on both sides, partners consistent |
| Grouping reproducibility | All 150 groups re-derived from the 9 Nov snapshot are identical |
| Unsampled relatives protected with a test group | 42 catalog products (166 incl. sampled) |
| Same store + same product name, or same store + near-identical page address (colour, size and count words removed), in different groups | 36 families touch the sample; **3 span dev and test** |

**The cross-split cases:**
1. **Stria round coffee table (Sicotas): one product listed twice.**
   - "Stria Round Coffee Tables in Dark Grey Alder" (test) and "Stria Coffee Table in Dark Grey Alder" (dev) have the same price.
   - Their store pages differ only by "tables" vs "table".
   - Caught by the **page** signal (`pageKey`). The names differ ("Round"), so the name signal alone misses it.
2. **Stria coffee table name family (Sicotas).** The same dev item shares a normalised name with the test "Stria Black Coffee Table" listings, which are on a different page ("new fashion design"). This is probably a *different* design under the same collection name: a candidate for human review, not a confirmed duplicate.
3. **Cas TV cabinet (Sicotas): one modular design in different configurations.** The dev item is a 2-door set of 2; the test item is a 3-door set of 2. Size and configuration variants of one design count as related under the agreed rules.

The address rules (same photo, same page) could not see any of these. Nothing has been labelled or scored, so nothing is contaminated yet. But the manifest **must not be used for test scoring as it stands.**

### Manifest v2 (created in Stage 2: `data/vision-eval/manifest-v2.json`, hash `d8ff09ff…`)

**Stage 2 update:** v2 was created with both rules, and v1 is kept unchanged. The real result matches the dry run below. Every correction is listed in `manifest-v2.corrections.json` (114 in the catalog, 21 touching the sample, 2 leaking groups fixed, 41 products changing side, 0 cross-retailer candidates). The manifest records `imageHashCheck` and `crossRetailerReview` as `not-run`, and test-split scoring refuses until both are done. Status: `docs/vision/STAGE2_REPORT.md`.

*Original proposal, kept for the record:*

Add two grouping rules:
- **Same-name family:** same store + same `productNameKey`.
- **Near-identical page:** same store + same `pageKey`.

Listings matching either are related. Both rules are deliberately over-inclusive: grouping too much costs only some balance in the split, while grouping too little leaks.

A dry run (scratchpad only, nothing written to the repository) gave:

| | v1 (frozen) | v2 with both rules |
| --- | --- | --- |
| Sampled products | 200 | the same 200 |
| Dev / test | 76 / 124 | 75 / 125 |
| Products changing side | — | 41 |
| The Stria duplicate and the Cas family | split across dev and test | all on the test side |
| Groups on both sides | 0 by the address rules; 3 known families leak | 0 |

The name rule alone would **not** have fixed the Stria duplicate (it misses "Round … Tables"); the page rule is needed too. A unit test pins both cases.

**Recommendation:** create v2 **once**, in Stage 2, after the perceptual-hash duplicate check on the images (which can only run once image use is approved).
- Use the two rules plus every duplicate confirmed by the hash check and a short human review of the flagged families.
- Bump `MANIFEST_VERSION` and record the new hash.
- The test-run log is keyed by manifest hash, so v1 can never be mixed with v2.
- Until then, v1 stays frozen and is not used for scoring.

### What the pilot can and cannot conclude

The unit of evidence is the number of **independent designs** (groups), not products. Coverage of the frozen sample (items / groups / stores):

| Type | Dev | Test | Whole catalog (groups) | Conclusions supported |
| --- | --- | --- | --- | --- |
| Nightstands | 20 / 16 / 2 | 31 / 19 / 2 | 289 | **Type-level results**, both stores |
| Dining tables | 14 / 13 / 2 | 20 / 13 / 1 | 338 | Type-level, indicative; test has one store only |
| TV stands | 10 / 10 / 2 | 15 / 12 / 2 | 280 | Type-level, indicative |
| Dressers | 7 / 7 / 1 | 11 / 10 / 1 | 117 | Indicative; one store (Sicotas) |
| Coffee tables | 8 / 8 / 2 | 12 / 9 / 2 | 97 | Indicative; wide intervals |
| Rugs | 6 / 5 / 1 | 10 / 8 / 1 | 52 | Overall only; one store, and rugs are flat (different visual cues) |
| Sofas | 6 / 3 / 1 | 12 / 6 / 2 | 12 | Overall only; 12 designs in the whole catalog |
| Accent chairs | 3 / 2 / 1 | 4 / 3 / 1 | 5 | **None per type** |
| Bar stools | 1 / 1 / 1 | 3 / 1 / 1 | 2 | **None per type** |
| Bed frames | 1 / 1 / 1 | 2 / 2 / 1 | 3 | **None per type** |
| Dining chairs | 0 / 0 / 0 | 4 / 1 / 1 | 1 | **None.** All 4 are one design, which is also the only dining-chair design in the catalog |

**Can support:**
- overall accuracy on each dimension;
- results by room, if needed;
- type-level results for nightstands, and indicative ones for dining tables, TV stands, dressers and coffee tables;
- the cross-store check in the four types sold by two stores.

**Cannot support:**
- any claim about chairs, stools, beds or accent chairs as a type;
- store-level comparisons beyond Tribesigns vs Sicotas (Welax has 21 items, mostly sofas and accent chairs);
- cut-out vs room-photo comparisons until photos are classified in Stage 2 (152 of 200 are unmeasured);
- anything about categories outside furniture.

**Dining chairs:**
- The thin coverage is a **catalog** limit, not a sampling one: resampling cannot add dev coverage.
- No threshold or tuning is type-specific, so having zero dev items doesn't break the method.
- It does mean dining-chair results are anecdotal.
- More chair designs need more feeds (Phase 4), not a new sample.
