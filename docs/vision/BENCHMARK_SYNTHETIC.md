# Synthetic-drawing benchmark: results (16 Nov 2026)

**What this is:** a one-off, approved, no-cost technical benchmark.
- **Inputs:** 64 of **CureAvo's own synthetic drawings**, with no retailer image.
- **Where:** a standard GitHub-hosted runner (ubuntu-latest: 4 CPUs, 16 GB RAM; free for public repositories), 4 threads, CPU only.
- **Run:** [43938287020](https://github.com/devinbradford/shoppingswipe/actions/runs/43938287020), 2 min 21 s in total, **0 failures**.

**What this is not:** a quality comparison. Drawings say nothing about how well a model understands real furniture, so **no model "won"**. Only human labels on real catalog photos can decide that (Stage 2, paused pending image permissions).

## Pinned models (licences re-read from each model card)

| Model | Revision (commit) | Licence on card | Repo size |
| --- | --- | --- | --- |
| SigLIP 2 Base (`google/siglip2-base-patch16-224`) | `75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2` | Apache-2.0 | 1,468 MB |
| Marqo Ecommerce B (`Marqo/marqo-ecommerce-embeddings-B`) | `6854090aa39b2a9d70f390d83ae9e70cf9d9004e` | Apache-2.0 | 2,328 MB (one 778 MB weights file downloaded) |
| DINOv2 Base (`facebook/dinov2-base`) | `f9e44c814b77203eaa57a6bdbbd535f21ede1415` | Apache-2.0 | 661 MB |
| OpenCLIP ViT-B/32 LAION-2B (`laion/CLIP-ViT-B-32-laion2B-s34B-b79K`) | `1a25a446712ba5ee05982a381eed697ef9b435cf` | MIT | 2,312 MB (one weights file downloaded) |

These revisions are saved in `tools/vision-models/models.lock.json`, and every later run uses exactly them.

## Measurements

| | SigLIP 2 B | Marqo Ecom B | DINOv2 B | OpenCLIP B/32 |
| --- | --- | --- | --- | --- |
| Parameters | 375 M | 203 M | 87 M | 151 M |
| Weights loaded | 1,468 MB | 778 MB | 330 MB | 581 MB |
| Embedding size | 768 | 768 | 768 | 512 |
| Load time | 12.2 s | 7.5 s | **1.1 s** | 5.6 s |
| Peak memory above baseline | 1,102 MB | 1,477 MB | **474 MB** | 508 MB |
| Encoding, one image at a time | 130 ms | 121 ms | 148 ms | **54 ms** |
| Encoding, batches of 16 | 118 ms/image (8.5/s) | 111 ms/image (9.1/s) | 127 ms/image (7.9/s) | **27 ms/image (37/s)** |
| Search: top 10 of 2,000 / 10,000 stored | 0.13 / 0.57 ms | 0.13 / 0.58 ms | 0.16 / 0.67 ms | 0.10 / 0.49 ms |
| Index size, 10,000 products | 29 MB | 29 MB | 29 MB | 20 MB |
| Two identical runs differ by | 0 | 0 | 0 | 0 |
| One-at-a-time vs batched differ by | 4e-7 | 3e-7 | 3e-7 | 2e-7 |

**Decision rule** (from the model README): identical runs equal, batch difference below 1e-4, peak memory under 4 GB, full catalog under 30 CI minutes, and the licence re-confirmed. **All four models pass.** At about 0.12 s per photo, the whole catalog of about 2,000 photos takes about 4 minutes per model on this runner. Search speed and index size are not a constraint at CureAvo's scale.

Embedding fingerprints (for cross-machine checks) are in the run log.

## What it means

- Every candidate is technically usable on free CPU infrastructure, so cost and speed won't decide between them; **quality will**.
- OpenCLIP B/32 is about 4× faster but coarser (32-px patches). DINOv2 is the lightest to load and run. SigLIP 2 and Marqo are the heaviest, at about 1–1.5 GB of memory.
- Next comparison: on real catalog photos, against human structure and overall-look labels. This needs image permissions P1–P3.
