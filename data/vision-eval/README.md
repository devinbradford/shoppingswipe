# Visual evaluation data

- `manifest.json`: the 200-product evaluation set (ids, photo **addresses**, groups, dev/test split, hash). It contains no images, prices or affiliate links. Rebuild or verify it with `npm run vision:sample` (see `docs/vision/EVALUATION_METHOD.md`).
- `labels/<pack id>/<rater>.json`: rater exports (Stage 2). These use rater codes only, never names.
- `test-runs.json`: the append-only log of every scoring of the protected test split. Never edit it by hand.

Source images never go in this folder or anywhere else in the repository.
