# Visual Intelligence Stage 2: status report (14 Nov 2026)

**Summary.** Stage 2 is approved, but the retailer-image work in it is **paused**, as instructed, because the image permissions aren't yet established for P1–P4. Everything that needs no retailer image is done and verified:
- the corrected manifest;
- the privacy fix;
- the baselines;
- the reduced workload with adjudication;
- the real-photo pilot pack, built but not sent;
- the bounded image fetcher, built but not run;
- the model-harness upgrades.

**No model has been run on any image, so there is no winner.** No production code, ranking, learning, sampling, UI, schema or affiliate link changed, and the V2 golden benchmark tests still pass.

## 1. Status by section

| Section | Status | Detail |
| --- | --- | --- |
| Authorization | **Blocker** | Awin's permission is **verbal only** (recorded as A1). Its scope against P1–P4 isn't itemised, and none of Tribesigns, Sicotas or Welax has given permission or had its program terms read. All retailer-image work is paused. See `IMAGE_PERMISSIONS.md` for the assessment and the written follow-up request. |
| Review of existing work | Done | Plan, Engine Lab baseline, M1 plan, method, protocol, calibration results and permissions re-read. Production functionality and V2 benchmarks untouched (full test suite passes). |
| Dataset correction | **Done** (grouping final only after the image checks) | `manifest-v2.json` (hash `d8ff09ff…`) supersedes `d711082b…`, which is kept. Details in §2. |
| Real-image pilot (≤200 products, ≤600 thumbnails) | Ready, **paused** | `fetch_images.py` has a hard cap of 600, a 512 px width, the store CDN only, provenance logging, a refusal without an approval reference, folders outside the repo only, and logged deletion. Not run. |
| Model comparison | Ready, **blocked here** | huggingface.co and download.pytorch.org can't be reached from this session (verified again today). §4 gives the exact requirements. |
| Two kinds of visual understanding | Built (Stage 1.5) | Structure and overall look, the divergent set, shape vs colour, finish, and photography and store-style checks. Ready for real labels. |
| Human evaluation | Prepared; **paused** for real photos | Reduced workload applied. Real-photo timing pack built (dev only). Calibration **not final**: outside-rater independence is unconfirmed and one more rater may follow. Raw responses removed from the public repo. |
| Best-model decision | **No winner** | No human labels on real photos and no model outputs yet. Only preliminary technical checks of the baselines (§5). |
| Opportunity for CureAvo | Analysis below | Hypotheses to test, not findings (§6). |

## 2. Dataset correction (manifest v2)

| | v1 (kept, frozen) | v2 |
| --- | --- | --- |
| File | `data/vision-eval/manifest.json` | `data/vision-eval/manifest-v2.json` |
| Fingerprint | `d711082b…` | `d8ff09ffb4ff4190671b6571395f5254a1f558115d2ef342d317b8dc13130c8d` |
| Products | 200 | the same 200 |
| Dev / test | 76 / 124 | 75 / 125 |
| Grouping rules | same photo, same store page, confirmed duplicates | the same three **plus** same-store product-name families and near-identical page addresses |
| Groups on both sides | 0 by its own rules, but 3 known families leaked | 0 |
| Reproducible | yes (`--rules v1` gives it byte for byte) | yes (rebuilt twice, byte-identical; corrections file too) |

**Corrections log** (`manifest-v2.corrections.json`):
- 114 corrections across the catalog, 21 of them touching the sample;
- **2 leaking groups fixed**: the two Stria listings are now one group, and the Cas 2-door and 3-door cabinets are one group;
- 41 products change side.

**Cross-retailer duplicates:** 0 candidates. No shared normalised names or distinctive photo file names across stores touch the sample. Visual cross-store duplicates can only be found from the images (P3).

**Still open** (recorded in the manifest itself as `imageHashCheck: not-run` and `crossRetailerReview: not-run`):
- a duplicate-fingerprint check on the photos;
- human review of its candidates.

`npm run vision:evaluate -- --split test` **refuses** until both are done (`testScoringBlockers`).

**What the pilot can conclude** is unchanged from `EVALUATION_METHOD.md` §9:
- overall results and nightstand-level results;
- indicative results for dining tables, TV stands, dressers and coffee tables;
- nothing per type for chairs, stools, beds or accent chairs. That's a catalog limit: dining chairs are one design in the whole catalog.

## 3. Privacy fix

**The repository is public.** The three calibration exports committed in `a729bf0` (rater codes, timestamps, per-person answers) have been removed from the current files and replaced by a de-identified summary (`labels-summary/calibration-v2-1.json`). Raw exports are now git-ignored, and the docs no longer name or time individual raters.

**The old files are still in the git history** (commit `a729bf0`). Removing them needs a history rewrite and a force-push, which is destructive for anyone with a copy of the repository, so it needs Devin's approval. Making the repository private is the alternative.

## 4. Model execution: exact requirements

**Candidates:**

| Model | Hugging Face repo | Licence |
| --- | --- | --- |
| SigLIP 2 Base | `google/siglip2-base-patch16-224` | Apache-2.0 |
| Marqo Ecommerce B | `Marqo/marqo-ecommerce-embeddings-B` | Apache-2.0 |
| DINOv2 Base | `facebook/dinov2-base` | Apache-2.0 |
| OpenCLIP ViT-B/32 | `laion/CLIP-ViT-B-32-laion2B-s34B-b79K` | MIT |

Dependencies are pinned (`requirements.txt`; resolution checked). Model revisions are pinned at the first metadata read (`--resolve-revisions` writes `models.lock.json`).

**Measured per model** by `measure_models.py`:
- load time and peak memory;
- weights on disk;
- embedding dimension;
- encoding speed at batch 1 and batch 16;
- **retrieval latency**: top-10 over 2,000 and 10,000 stored vectors, plus index size;
- determinism: identical runs, batch-1 vs batched, and an embedding fingerprint.

Benchmark images are CureAvo's own synthetic drawings.

**Ways to run it (Devin chooses):**
1. **GitHub Actions** (recommended): `.github/workflows/vision-benchmark.yml` has been added, **manual only, not started**. Actions tab → vision-benchmark → Run workflow; the results come back as a download. It uses only our synthetic drawings.
2. **This cloud session:** allow `huggingface.co`, its file-storage hosts and `download.pytorch.org` in the environment's network settings.
3. **A Mac or Linux computer:** the commands in `tools/vision-models/README.md`.

Nothing was installed in the React Native app.

## 5. Preliminary technical findings (no winner)

**Baselines** (`npm run vision:baselines`; vectors git-ignored). This is a technical check on the 75 **dev** products against catalog facts, not human judgments:

| System | Own colour/photo variant in top 5 (5 pairs) | Same-store share of top 10 (chance 76%) | ms per query |
| --- | --- | --- | --- |
| Catalog tags | 5/5 | 79% | 0.03 |
| Colour-aware | 5/5 | 81% | 0.01 |
| Text (title + description) | 5/5 | **86%** | 0.01 |
| Random | 2/5 | 75% | 0.01 |

- With only 5 variant pairs in dev, the first column only proves the plumbing works.
- The text baseline's preference for the **same store** (86% vs 76% expected by chance) is a real early signal. Store-specific wording makes "similar" partly mean "same store", the shortcut the cross-store metric exists to catch.
- A visual model must beat these baselines on **human** judgments, not on these checks.
- **Retrieval speed is not a constraint at our scale.** A brute-force search over 10,000 vectors took 0.06 ms per query in the harness self-test. That used 48-dimension stand-in vectors, so the real 512–768-dimension numbers come from the benchmark.

## 6. CureAvo's opportunity: what embeddings could contribute (hypotheses to test)

The goal is learning **individual shoppers' visual taste**, not just finding look-alikes. Evidence so far comes from the Engine Lab (synthetic shoppers) and calibration round 1 (drawings). Both point the same way, but neither is a real-photo result.

**What we know today:**
- **V2 can't see visual taste.** When taste lives in shape, visual weight and finish (Engine Lab S06), V2 reaches 0.63 late relevance against an oracle of 0.94. It shows about as many loved pieces in the first 20 cards as random order.
- **V2 misses hidden gems.** A design with no tag of its own (S07) is found in 26% of sessions, against 33% for random. *Synthetic, but a clear gap.*
- **Colour drives taste a lot, and so does shape.** In calibration, the overall look followed colour about 37% of the time when shape and colour disagreed. So a useful system needs both, separately.

**How embeddings could help each goal:**

| Goal | How embeddings could help | How we'd test it (before any production use) |
| --- | --- | --- |
| Learning from Keep and Skip | Add "visual closeness to what you kept, minus closeness to what you skipped" as a few features in V2's Bayesian model (a 16–32-dim projection, not 768 raw numbers). Or keep several taste prototypes per shopper so two tastes both survive. | Engine Lab V3 policy with a learned visual channel, then real-photo S06/S07 scenarios built from human labels |
| Shape preference separate from colour | Use a **structure** signal (the model that wins the structure and divergent tests; possibly a colour-blind version of it, embedding greyscale images) alongside colour and wood tone as separate features. Then "loves this shape in any colour" and "loves walnut whatever the shape" can be learned apart. | Divergent-set accuracy per dimension; Engine Lab shoppers with separate shape and colour taste |
| Similar items from unfamiliar brands | A visual candidate channel: nearest neighbours of kept items, across stores | Cross-store ratio ≥ 0.8 against human-relevant items; pooled P@5 on the overall look |
| Hidden gems | Retrieval that ignores tags, so a design with no tag of its own can still be found from a kept look-alike | S07 gem-found rate vs V2's 26%; human-judged "unfamiliar design" retrieval |
| Avoiding repetition | Variety measured by visual distance, so five near-identical nightstands in other colours don't fill a deck. V2's variety uses tags, which variants share. | Near-duplicate rate in the first 20 cards (Engine Lab S10) |
| Better after the first few swipes | Spread the first cards across the visual space so early keeps and skips teach the most; seed from the onboarding rooms once their photos' licences are confirmed | Engine Lab cold-start windows (swipes 1–10, 11–20) |
| Preferences descriptions miss | Fluted fronts, tapered legs, chunky versus airy: only visible in the photo | Human attribute labels vs catalog tags; overall-look accuracy vs the text baseline |

**What each candidate might contribute** (expectations from how each was trained, to be confirmed or refuted by the evaluation):

| Model | Likely strength | Likely weakness | Possible role |
| --- | --- | --- | --- |
| **SigLIP 2 Base** | Broad image and text understanding. Its text side allows zero-shot attribute words ("rattan", "fluted", "mid-century"), useful for honest "For you" labels | Larger (~375 M with the text tower); a general model, not tuned for products | Overall-look embedding and attribute tagging |
| **Marqo Ecommerce B** | Trained on product images and text, so likely strongest on product retrieval and same-product detection | May learn store or photo-style cues from product listings; that needs the photography and cross-store checks | Overall-look retrieval and near-duplicates |
| **DINOv2 Base** | Self-supervised on images only; strong on geometry, parts and fine detail | No text side (no zero-shot labels); still sensitive to colour unless given greyscale input | **Structure** signal and duplicate detection |
| **OpenCLIP ViT-B/32** | Smallest and fastest | Coarser detail (32-px patches) | Speed and cost baseline |

A plausible outcome to test is a **combination**: DINOv2 (or a greyscale variant) for structure plus catalog colour for colour, against a single SigLIP 2 or Marqo embedding for the overall look. The divergent set decides which approach matches people better.

## 7. Exact steps to begin the real-image pilot

1. **Permissions** (Devin):
   - send the Awin follow-up request and get the reply in writing;
   - read the three programs' terms in Awin;
   - send the advertiser request unless Awin's reply explicitly covers the advertisers.

   Record each reply in `IMAGE_PERMISSIONS.md` as A2, A3, …
2. **Privacy:** decide between rewriting git history and making the repository private (§3).
3. **Raters:** confirm the two outside raters answered independently; optionally add one more rater to the drawing calibration.
4. **Models:** run the vision-benchmark workflow, or allow the model hosts here. This pins revisions and gives speed, memory, size, latency and determinism.
5. **With P1:** `npm run vision:pilot-pack -- --release --approval-ref "A…"`. Three raters time the 11-screen real-photo pack, and the full-round plan is re-sized from those times.
6. **With P2 and P3:**
   - `fetch_images.py fetch` (≤600 thumbnails, provenance logged), then `hashes`;
   - people confirm the duplicate candidates and the cross-retailer review;
   - rebuild the manifest with `--duplicates … --image-hash-checked --cross-retailer-reviewed` (new fingerprint), so grouping becomes final;
   - `measure_models.py --embed` for the four models plus the baselines;
   - `fetch_images.py purge` per the agreed retention.
7. **Labelling on dev and test:**
   - 300 two-question triplets;
   - 150 two-question pairs;
   - 80 same-thing checks;
   - attributes by 2 raters per product, with a third only for disagreements;
   - pooled relevance from all systems at equal depth.
8. **Dev experiments:** repeat freely, then freeze the model choice, thresholds and settings.
9. **Test:** score once, logged, then pick a winner against human judgments only.
