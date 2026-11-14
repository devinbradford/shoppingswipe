# Visual-model pilot environment: readiness report (Stage 1.5)

This is an offline evaluation environment, separate from the app. **Nothing here is installed by npm or Expo, bundled into the app or run in production.** The app gains no machine-learning dependency. **No model weights have been downloaded and no model has been run.**

## 1. Candidate models

| Name | Hugging Face repo | Licence (model card) | Params / output | Weights (approx.) | Loaded with |
| --- | --- | --- | --- | --- | --- |
| `siglip2-b` | `google/siglip2-base-patch16-224` | Apache-2.0 | ~375 M incl. text tower / 768-d | ~1.5 GB | transformers `AutoModel` → `get_image_features().pooler_output` |
| `marqo-ecom-b` | `Marqo/marqo-ecommerce-embeddings-B` | Apache-2.0 | ~203 M / 768-d | ~0.8 GB | open_clip `local-dir:` (pinned snapshot) |
| `dinov2-b` | `facebook/dinov2-base` | Apache-2.0 (was CC-BY-NC until 2023) | ~86 M / 768-d, image only | ~0.35 GB | transformers `AutoModel` → CLS token |
| `openclip-b32` | `laion/CLIP-ViT-B-32-laion2B-s34B-b79K` | MIT (weights); LAION notes its datasets are for research | ~151 M / 512-d | ~0.6 GB | open_clip `local-dir:` |
| `marqo-ecom-l` (optional) | `Marqo/marqo-ecommerce-embeddings-L` | Apache-2.0 | ~652 M / 1024-d | ~2.6 GB | open_clip `local-dir:` |

- The licences are read from model-card metadata through search results, because huggingface.co itself is blocked here. `--resolve-revisions` re-reads each card's licence tag and stops with a warning if it differs.
- Commercial use: Apache-2.0 and MIT both allow it with attribution and a licence notice.
- **LAION-2B dataset caveat:** the B/32 weights were trained on a web-scraped dataset that LAION describes as for research. The weights licence (MIT) does not restrict use, but it's a reputational and legal judgment worth noting before production. For the offline pilot it is fine.

## 2. Package compatibility (checked)

- **Pins** (`requirements.txt`): torch 2.15.0, torchvision 0.29.2, transformers 5.22.1, open_clip_torch 3.3.0, timm 1.0.30, huggingface_hub 2.4.0, safetensors 0.8.0, pillow 13.0.0, numpy 2.5.4, psutil 7.2.2. Each is the newest release at least two weeks old on 2026-11-14.
- `pip install --dry-run -r requirements.txt` resolves 64 packages with no conflicts. open_clip 3.3.0 requires `torch>=2.0` and `timm>=1.0.17`, both satisfied.
- **Code-level review of the pinned versions** (package source read from PyPI wheels; no weights):
  - open_clip 3.3.0 supports `local-dir:` (config plus `open_clip_model.safetensors` or `open_clip_pytorch_model.bin`). Every OpenCLIP-format model is therefore loaded from a snapshot pinned with `snapshot_download(revision=…)`. Before this review, the Marqo models went through `hf-hub:`, which can't be pinned; that is fixed.
  - transformers 5.22.1: `Siglip2Model.get_image_features` returns a `BaseModelOutputWithPooling`, and the harness uses its `pooler_output` (the image embedding). The NaFlex processor's extra inputs are passed through. `Dinov2Model` has no `get_image_features`, so the harness uses the CLS token.
  - Exactly one weights file is downloaded per model (safetensors preferred), even when a repo holds several formats.
- `measure_models.py --self-test` passes here (stand-in model, no torch, no downloads).
- **Not yet confirmed by running:** that each model actually loads and produces the expected dimension. That is the first thing `--measure` checks.

## 3. Pinned revisions

**Not pinned yet.** Commit hashes can only be read from huggingface.co, which this session can't reach. The procedure is:
1. `--resolve-revisions` reads each repo's current commit, licence tag and size. It downloads metadata only, no weights, and writes `models.lock.json`.
2. Commit `models.lock.json`.
3. Every later run loads exactly those commits and stops if the downloaded snapshot differs.

## 4. Hardware

| Need | Estimate (to be measured) |
| --- | --- |
| CPU | Any 64-bit x86 or ARM CPU. No GPU needed; results are more reproducible on CPU |
| RAM | 8 GB recommended. About 1–2.5 GB peak per B-size model, one at a time (about 4 GB for Marqo-L) |
| Disk | About 2 GB for CPU-only packages and about 3.3 GB of weights for the four B models (+2.6 GB for Marqo-L), in `~/.cache/huggingface` |
| Time | Throughput benchmark (64 drawings × 4 models): minutes. Full catalog (~2,000 photos): roughly 10–30 CPU minutes per model; to be measured |

## 5. Ways to run it (none started; each needs your OK)

| Option | What's needed | Recommendation |
| --- | --- | --- |
| **A. GitHub Actions** (manual "Run workflow" button) | A workflow file; GitHub runners can reach huggingface.co and pytorch.org. Nothing runs on your PC. | **Recommended.** Results come back as a downloadable file |
| B. This cloud session | Allow `huggingface.co`, its file-storage hosts (currently `cdn-lfs.huggingface.co` and `cas-bridge.xethub.hf.co`; confirm on the first blocked request) and `download.pytorch.org` in the environment's network settings | Fine for a one-off. The blocked hosts were confirmed with a 403 in Stage 1 |
| C. A Mac or Linux computer | Python 3.12 or 3.13, about 6 GB free | The same commands as below |

**Exact commands** (bash; for options A, B and C):

```bash
cd tools/vision-models
```

```bash
python3 -m venv .venv
```

```bash
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0 torchvision==0.29.2
```

```bash
.venv/bin/pip install -r requirements.txt
```

```bash
.venv/bin/python measure_models.py --self-test
```

```bash
.venv/bin/python measure_models.py --resolve-revisions
```

```bash
.venv/bin/python measure_models.py --measure
```

```bash
.venv/bin/python measure_models.py --measure --yes-download --out results.json
```

What each step does:
- `--resolve-revisions` downloads metadata only and writes `models.lock.json`.
- `--measure` on its own lists exactly what it would download (repo, size, pinned revision, licence) and stops.
- `--measure --yes-download` is **the approved throughput benchmark on CureAvo's own synthetic drawings**. It downloads the pinned weights and measures size, load time, peak memory, speed at batch 1 and batch 16, and reproducibility. No retailer image is involved.

**Option A workflow** (proposal; not added to the repository until approved):

```yaml
name: vision-model-benchmark
on: workflow_dispatch
jobs:
  measure:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    defaults: { run: { working-directory: tools/vision-models } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.13' }
      - run: pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0 torchvision==0.29.2
      - run: pip install -r requirements.txt
      - run: python measure_models.py --self-test
      - run: python measure_models.py --resolve-revisions
      - run: python measure_models.py --measure --yes-download --threads 4 --out results.json
      - uses: actions/upload-artifact@v4
        with: { name: vision-benchmark, path: "tools/vision-models/results.json\ntools/vision-models/models.lock.json" }
```

## 6. What `--measure` reports, and the decision rule

- **Size and shape:** parameters, weights on disk, embedding dimension.
- **Speed and memory:** load time; peak memory above baseline (sampled every 10 ms); ms per image at batch 1 and 16; images per second.
- **Reproducibility:** the largest difference between two identical runs; batch-1 vs batched; a hash of the embeddings rounded to 5 decimals, for cross-machine comparison.
- **Environment:** library versions, CPU, threads.
- **Settings:** seed 20261113, fixed threads, `torch.use_deterministic_algorithms(True)`, inference mode, float32, L2-normalised.

**A model goes on to the real-image pilot only if all of these hold:**
- 0 difference between identical runs;
- batch-1 vs batched difference below 1e-4;
- peak memory below 4 GB;
- an estimated full-catalog run under 30 CI minutes;
- the licence is re-confirmed on its card.

## 7. Stage 2 only (not authorised)

`--embed` turns local images (`<dir>/<product id>.jpg`, kept **outside** the repository) into `{product id: vector}` files for `npm run vision:evaluate`. It refuses to run:
- without `--approval-ref`, pointing to the recorded approvals P1–P4 in `docs/vision/IMAGE_PERMISSIONS.md`;
- with an image folder inside the repository.

It also forces offline mode, so nothing leaves the machine.
