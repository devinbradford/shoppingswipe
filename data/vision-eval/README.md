# Visual evaluation data

- `manifest-v2.json` (current): the corrected sample (same 200 products, name and page family grouping rules, hash `d8ff09ff…`); `manifest-v2.corrections.json` lists every grouping correction versus v1. Grouping is final only after the image-hash check and cross-retailer review, and test scoring is blocked until then.
- `manifest.json` (v1, kept unchanged for reproducibility; superseded): the 200-product evaluation set (ids, photo **addresses**, groups, dev/test split, hash). It contains no images, prices or affiliate links. Rebuild or verify it with `npm run vision:sample` (see `docs/vision/EVALUATION_METHOD.md`).
- `labels/`: **private, git-ignored.** Raw rater exports (rater codes, timestamps, per-person answers) are never committed, because this repository is public.
- `labels-summary/<pack id>.json`: de-identified summaries (`npm run vision:summarize`): vote counts per question, median times, report numbers.
- `test-runs.json`: the append-only log of every scoring of the protected test split. Never edit it by hand.

- `embeddings/`: **git-ignored.** Vectors derived from retailer data.

Source images never go in this folder or anywhere else in the repository.
