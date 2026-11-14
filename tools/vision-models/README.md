# Visual-model pilot environment

This is an offline evaluation environment, separate from the app. **Nothing here is installed by npm or Expo, bundled into the app or run in production.** The app gains no machine-learning dependency.

## Candidate models

| Name | Source | Size (approx.) | Why it's a candidate |
| --- | --- | --- | --- |
| `siglip2-b` | `google/siglip2-base-patch16-224` (transformers) | ~375 M params incl. text tower | strong general image–text model |
| `marqo-ecom-b` | `hf-hub:Marqo/marqo-ecommerce-embeddings-B` (open_clip) | ~200 M | tuned on e-commerce product photos |
| `dinov2-b` | `facebook/dinov2-base` (transformers) | ~86 M, image only | shape and structure without text; a useful contrast |
| `openclip-b32` | OpenCLIP `ViT-B-32` / `laion2b_s34b_b79k` | ~150 M | small, fast baseline |
| `marqo-ecom-l` (optional) | `hf-hub:Marqo/marqo-ecommerce-embeddings-L` | ~650 M | only if B models fall short |

All open weights run locally on CPU. No hosted AI service is used.

## Pinned dependencies (`requirements.txt`)

- Packages: torch 2.15.0, torchvision 0.29.2, transformers 5.22.1, open_clip_torch 3.3.0, timm 1.0.30, huggingface_hub 2.4.0, safetensors 0.8.0, pillow 13.0.0, numpy 2.5.4, psutil 7.2.2.
- Each pin is the newest release at least two weeks old on 2026-11-14.
- They resolve together: `pip install --dry-run` resolved 64 packages with no conflicts.
- Model weights are pinned by commit. The first `--measure` writes `models.lock.json`; commit that file, then pass `--revision name=<commit>` on later runs.

## Setup on a machine that can reach the internet (Mac/Linux shown)

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
.venv/bin/python measure_models.py --measure --out results.json
```

**Disk and memory needs** (estimated; `--measure` reports the real numbers):
- about 2 GB of disk for packages;
- about 2.5 GB of model files for the four B-size models, cached in `~/.cache/huggingface`;
- about 2 GB of RAM peak for one model at a time.

**Hosts needed:** `pypi.org` and `files.pythonhosted.org` for packages; `download.pytorch.org` for CPU torch; `huggingface.co` and its file CDN for weights. **In this cloud session, `huggingface.co` and `download.pytorch.org` are blocked by the network policy** (403). So only `--self-test` was run here. Model size, speed, memory and reproducibility have **not** been measured yet. Options:
- run `--measure` on Devin's computer or a GitHub Actions job;
- allow those two hosts for a later session.

## What `--measure` reports (synthetic drawn images only; no retailer image)

- parameters, size of the weights on disk, embedding dimension;
- load time, and peak memory above the starting baseline (sampled every 10 ms);
- milliseconds per image at batch size 1 and at batch size 16, and images per second;
- **reproducibility:**
  - the largest difference between two identical runs;
  - batch-1 vs batched results;
  - a hash of the embeddings rounded to 5 decimals, so runs on two machines can be compared;
- environment: Python, library versions, CPU and thread count.

**Settings:** seed 20261113; a fixed thread count (`--threads`, default 4); `torch.use_deterministic_algorithms(True)`; inference mode; float32 vectors, L2-normalised.

**Decision rule before any large run:** a model is only considered if all of these hold on the runner that would do the job:
- 0 difference between identical runs;
- batch-1 vs batched difference below 1e-4;
- peak memory below 4 GB;
- the full catalog (about 2,000 photos) would embed in under 30 CI minutes.

## Stage 2 only (not authorised yet)

`--embed` turns local images (`<dir>/<product id>.jpg`, kept **outside** the repository) into `{product id: vector}` files for `npm run vision:evaluate`. It refuses to run without:
- `--approval-ref`, pointing to the recorded approval in `docs/vision/IMAGE_PERMISSIONS.md`;
- an image folder outside the repository.

It also forces offline mode, so nothing leaves the machine.
