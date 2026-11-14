# Visual evaluation data

- `manifest.json`: the 200-product evaluation set (ids, photo **addresses**, groups, dev/test split, hash). It contains no images, prices or affiliate links. Rebuild or verify it with `npm run vision:sample` (see `docs/vision/EVALUATION_METHOD.md`).
- `labels/`: **private, git-ignored.** Raw rater exports (rater codes, timestamps, per-person answers) are never committed, because this repository is public.
- `labels-summary/<pack id>.json`: de-identified summaries (`npm run vision:summarize`): vote counts per question, median times, report numbers.
- `test-runs.json`: the append-only log of every scoring of the protected test split. Never edit it by hand.

Source images never go in this folder or anywhere else in the repository.
