#!/usr/bin/env python3
"""
Visual-model pilot harness (V3 Milestone 1). Offline, CPU, isolated from the app.

  python measure_models.py --self-test
      Checks this harness with a tiny built-in stand-in model (no downloads, no torch needed).

  python measure_models.py --resolve-revisions [--models …]
      Metadata only (no weights): records each model's current commit, licence tag and size in
      models.lock.json. Needs huggingface.co.

  python measure_models.py --measure [--models siglip2-b,marqo-ecom-b,dinov2-b,openclip-b32] [--out results.json]
      Throughput benchmark on CureAvo's own SYNTHETIC drawings only (no retailer image). Without
      --yes-download it only lists what it would download; with it, it fetches the pinned weights
      once and measures size, load time, peak memory, speed and run-to-run reproducibility.

  python measure_models.py --embed --manifest ../../data/vision-eval/manifest.json --images <dir> \
        --approval-ref "<where Stage 2 approval is recorded>" --models … --out-dir emb/
      Stage 2 ONLY (needs separate approval; see docs/vision/IMAGE_PERMISSIONS.md). Reads images
      that are already on this computer (<dir>/<product id>.<ext>), embeds them locally with the
      network switched off, and writes {product id: vector} JSON for `npm run vision:evaluate`.
      Never uploads anything; never writes images into the repository.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
import platform
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

# The candidate models. Every model is fetched with huggingface_hub.snapshot_download at a pinned
# commit (`revision`) and loaded from that local folder, so runs are reproducible. Commits are
# resolved once (--resolve-revisions, metadata only) and stored in models.lock.json.
# Licences per the model cards (re-check the card when resolving revisions):
#   siglip2-b Apache-2.0 · marqo-ecom-b/l Apache-2.0 · dinov2-b Apache-2.0 (was CC-BY-NC until 2023)
#   · openclip-b32 MIT (weights; LAION notes its datasets are for research).
MODELS = {
    "siglip2-b": {"kind": "hf", "repo": "google/siglip2-base-patch16-224", "licence": "apache-2.0", "approx_mb": 1500, "note": "SigLIP 2 Base/16, 224 px, image+text"},
    "marqo-ecom-b": {"kind": "open_clip", "repo": "Marqo/marqo-ecommerce-embeddings-B", "licence": "apache-2.0", "approx_mb": 820, "note": "Marqo e-commerce B (ViT-B/16 SigLIP), 768-d"},
    "dinov2-b": {"kind": "hf", "repo": "facebook/dinov2-base", "licence": "apache-2.0", "approx_mb": 350, "note": "DINOv2 Base/14, image only (CLS)"},
    "openclip-b32": {"kind": "open_clip", "repo": "laion/CLIP-ViT-B-32-laion2B-s34B-b79K", "licence": "mit", "approx_mb": 610, "note": "OpenCLIP ViT-B/32 LAION-2B"},
    "marqo-ecom-l": {"kind": "open_clip", "repo": "Marqo/marqo-ecommerce-embeddings-L", "licence": "apache-2.0", "approx_mb": 2600, "note": "optional, large"},
}
DEFAULT = ["siglip2-b", "marqo-ecom-b", "dinov2-b", "openclip-b32"]
SEED = 20261113


def rss_mb() -> float:
    try:
        import psutil

        return psutil.Process().memory_info().rss / 2**20
    except ImportError:  # pragma: no cover
        import resource

        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


class PeakMemory:
    """Samples resident memory in a background thread (peak during a block)."""

    def __init__(self) -> None:
        import threading

        self.peak = rss_mb()
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        while not self._stop.is_set():
            self.peak = max(self.peak, rss_mb())
            time.sleep(0.01)

    def __enter__(self) -> "PeakMemory":
        self._t.start()
        return self

    def __exit__(self, *a: object) -> None:
        self._stop.set()
        self._t.join()
        self.peak = max(self.peak, rss_mb())


def synthetic_images(n: int, seed: int = SEED):
    """Our own drawn furniture-like shapes (PIL), never retailer images."""
    from PIL import Image, ImageDraw

    rng = random.Random(seed)
    out = []
    for _ in range(n):
        bg = (247, 247, 245) if rng.random() < 0.5 else tuple(rng.randint(200, 240) for _ in range(3))
        im = Image.new("RGB", (448, 448), bg)
        d = ImageDraw.Draw(im)
        col = tuple(rng.randint(30, 220) for _ in range(3))
        w, h = rng.randint(160, 360), rng.randint(40, 200)
        x0, y1 = (448 - w) // 2, 360
        d.rounded_rectangle([x0, y1 - h, x0 + w, y1], radius=rng.randint(0, 30), fill=col)
        for lx in (x0 + 10, x0 + w - 18):
            d.rectangle([lx, y1, lx + 8, y1 + rng.randint(10, 60)], fill=tuple(int(c * 0.7) for c in col))
        out.append(im)
    return out


@dataclass
class Loaded:
    embed: Callable[[list], "list[list[float]]"]
    params: int
    files_mb: float
    revision: str


def configure_determinism(threads: int) -> None:
    import numpy as np
    import torch

    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.set_num_threads(threads)
    torch.use_deterministic_algorithms(True)


def load(name: str, revision: str | None) -> Loaded:
    import torch
    from huggingface_hub import snapshot_download

    spec = MODELS[name]
    # Exactly one weights file per model (repos often hold the same weights in several formats),
    # plus small config/tokenizer files. safetensors preferred; .bin only if no safetensors exists.
    small = ["*.json", "*.txt", "*.model"]
    weights = ["open_clip_model.safetensors", "open_clip_pytorch_model.safetensors"] if spec["kind"] == "open_clip" else ["model.safetensors"]
    path = snapshot_download(spec["repo"], revision=revision, allow_patterns=small + weights)
    if not any((Path(path) / w).exists() for w in weights):
        fallback = ["open_clip_pytorch_model.bin"] if spec["kind"] == "open_clip" else ["pytorch_model.bin"]
        path = snapshot_download(spec["repo"], revision=revision, allow_patterns=small + fallback)
    rev = Path(path).name  # the HF cache folder is named after the commit hash
    if revision and rev != revision:
        raise SystemExit(f"{name}: got revision {rev}, expected {revision}")
    if spec["kind"] == "hf":
        from transformers import AutoImageProcessor, AutoModel

        model = AutoModel.from_pretrained(path).eval()
        proc = AutoImageProcessor.from_pretrained(path)

        def embed(images):
            with torch.inference_mode():
                inputs = proc(images=images, return_tensors="pt")
                if hasattr(model, "get_image_features"):
                    # transformers 5 returns BaseModelOutputWithPooling; pooler_output is the image embedding.
                    v = model.get_image_features(**inputs)
                else:  # DINOv2: CLS token of the (layer-normed) last hidden state
                    v = model(**inputs).last_hidden_state[:, 0]
                v = getattr(v, "pooler_output", v)
                return torch.nn.functional.normalize(v.float(), dim=-1).tolist()

    else:
        import open_clip

        # 'local-dir:' (open_clip >= 3) loads config + weights from the pinned snapshot folder.
        model, _, preprocess = open_clip.create_model_and_transforms(f"local-dir:{path}")
        model.eval()

        def embed(images):
            with torch.inference_mode():
                x = torch.stack([preprocess(im) for im in images])
                return torch.nn.functional.normalize(model.encode_image(x).float(), dim=-1).tolist()

    params = sum(p.numel() for p in model.parameters())
    files_mb = sum(f.stat().st_size for f in Path(path).rglob("*") if f.is_file()) / 2**20
    return Loaded(embed=embed, params=params, files_mb=files_mb, revision=rev)


def resolve_revisions(names: list[str]) -> dict:
    """Metadata only (no weights): current commit, licence tag and total file size of each model repo."""
    from huggingface_hub import HfApi

    api = HfApi()
    lock = {}
    for n in names:
        info = api.model_info(MODELS[n]["repo"], files_metadata=True)
        card_licence = (info.card_data or {}).get("license") if info.card_data else None
        size = sum((f.size or 0) for f in (info.siblings or [])) / 2**20
        lock[n] = {"repo": MODELS[n]["repo"], "revision": info.sha, "licence_on_card": card_licence, "repo_mb": round(size)}
        if card_licence and card_licence != MODELS[n]["licence"]:
            print(f"WARNING {n}: card says licence {card_licence}, expected {MODELS[n]['licence']} — stop and review")
        print(json.dumps(lock[n]))
    return lock


def measure_one(name: str, loader: Callable[[], Loaded], images: list, batch: int = 16) -> dict:
    gc.collect()
    base = rss_mb()
    t0 = time.perf_counter()
    with PeakMemory() as mem_load:
        m = loader()
    load_s = time.perf_counter() - t0
    m.embed(images[:2])  # warm-up
    with PeakMemory() as mem_run:
        t1 = time.perf_counter()
        single = [m.embed([im])[0] for im in images[:16]]
        t_single = (time.perf_counter() - t1) / 16
        t2 = time.perf_counter()
        batched = []
        for i in range(0, len(images), batch):
            batched += m.embed(images[i : i + batch])
        t_batch = (time.perf_counter() - t2) / len(images)
    again = []
    for i in range(0, len(images), batch):
        again += m.embed(images[i : i + batch])

    def maxdiff(a, b):
        return max(abs(x - y) for u, v in zip(a, b) for x, y in zip(u, v))

    digest = hashlib.sha256(json.dumps([[round(x, 5) for x in v] for v in batched]).encode()).hexdigest()
    return {
        "model": name,
        "revision": m.revision,
        "params_millions": round(m.params / 1e6, 1),
        "weights_mb": round(m.files_mb, 1),
        "dim": len(batched[0]),
        "load_seconds": round(load_s, 2),
        "peak_rss_mb_over_baseline": round(max(mem_load.peak, mem_run.peak) - base, 1),
        "ms_per_image_batch1": round(t_single * 1000, 1),
        "ms_per_image_batched": round(t_batch * 1000, 1),
        "images_per_second_batched": round(1 / t_batch, 1),
        "same_run_max_abs_diff": maxdiff(batched, again),
        "batch1_vs_batched_max_abs_diff": maxdiff(single, batched[:16]),
        "embedding_sha256_5dp": digest,
    }


def environment(threads: int) -> dict:
    info = {"python": sys.version.split()[0], "platform": platform.platform(), "machine": platform.machine(), "cpu_count": os.cpu_count(), "threads": threads}
    for mod in ("torch", "transformers", "open_clip", "numpy", "PIL"):
        try:
            info[mod] = __import__(mod).__version__
        except Exception:  # noqa: BLE001
            info[mod] = None
    return info


def self_test() -> int:
    """Harness check with a stand-in 'model' (numpy colour histogram). No torch, no downloads."""
    import numpy as np

    images = synthetic_images(40)

    def loader() -> Loaded:
        def embed(ims):
            out = []
            for im in ims:
                a = np.asarray(im.resize((64, 64)), dtype=np.float64)
                h = np.concatenate([np.histogram(a[..., c], bins=16, range=(0, 255))[0] for c in range(3)]).astype(float)
                out.append((h / np.linalg.norm(h)).tolist())
            return out

        return Loaded(embed=embed, params=0, files_mb=0.0, revision="stand-in")

    r = measure_one("stand-in-histogram", loader, images)
    print(json.dumps({"environment": environment(1), "results": [r]}, indent=1))
    ok = r["dim"] == 48 and r["same_run_max_abs_diff"] == 0 and r["batch1_vs_batched_max_abs_diff"] == 0 and len(images) == 40
    again = measure_one("stand-in-histogram", loader, synthetic_images(40))
    ok = ok and again["embedding_sha256_5dp"] == r["embedding_sha256_5dp"]
    print("SELF-TEST", "PASSED" if ok else "FAILED")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--self-test", action="store_true")
    g.add_argument("--measure", action="store_true")
    g.add_argument("--embed", action="store_true")
    g.add_argument("--resolve-revisions", action="store_true", help="metadata only: write models.lock.json with current commits")
    ap.add_argument("--models", default=",".join(DEFAULT))
    ap.add_argument("--revision", action="append", default=[], help="name=commit (pin a model revision)")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--images", help="Stage 2: directory of local images named <product id>.<ext>")
    ap.add_argument("--manifest")
    ap.add_argument("--approval-ref", help="Stage 2: where the written image-use approval is recorded")
    ap.add_argument("--out", default="results.json")
    ap.add_argument("--out-dir", default="emb")
    ap.add_argument("--yes-download", action="store_true", help="confirm downloading the listed model weights (--measure)")
    a = ap.parse_args()
    if a.self_test:
        return self_test()

    names = [n for n in a.models.split(",") if n]
    unknown = [n for n in names if n not in MODELS]
    if unknown:
        print(f"unknown models: {unknown}; choose from {list(MODELS)}")
        return 2
    if a.resolve_revisions:
        Path("models.lock.json").write_text(json.dumps(resolve_revisions(names), indent=1) + "\n")
        print("wrote models.lock.json (commit it; later runs use these exact revisions)")
        return 0
    lock = json.loads(Path("models.lock.json").read_text()) if Path("models.lock.json").exists() else {}
    revisions = {n: lock[n]["revision"] for n in names if n in lock}
    revisions.update(dict(r.split("=", 1) for r in a.revision))
    if a.measure and not a.yes_download:
        total = sum(MODELS[n]["approx_mb"] for n in names)
        print("Would download (approx.):")
        for n in names:
            print(f"  {n:13} {MODELS[n]['repo']:42} ~{MODELS[n]['approx_mb']} MB  revision {revisions.get(n, 'UNPINNED (run --resolve-revisions first)')}  licence {MODELS[n]['licence']}")
        print(f"  total ~{total} MB into ~/.cache/huggingface. Re-run with --yes-download once approved.")
        return 2
    configure_determinism(a.threads)

    if a.measure:
        images = synthetic_images(64)
        results = []
        for n in names:
            print(f"measuring {n} …", flush=True)
            r = measure_one(n, lambda n=n: load(n, revisions.get(n)), images)
            results.append(r)
            lock[n] = {**lock.get(n, {}), "repo": MODELS[n]["repo"], "revision": r["revision"]}
            print(json.dumps(r), flush=True)
        Path(a.out).write_text(json.dumps({"measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "environment": environment(a.threads), "results": results}, indent=1) + "\n")
        Path("models.lock.json").write_text(json.dumps(lock, indent=1) + "\n")
        print(f"wrote {a.out} and models.lock.json")
        return 0

    # --embed (Stage 2 only)
    if not a.approval_ref or not a.images or not a.manifest:
        print("--embed is Stage 2 only: needs --approval-ref, --images and --manifest (see docs/vision/IMAGE_PERMISSIONS.md)")
        return 2
    os.environ["HF_HUB_OFFLINE"] = "1"  # weights must already be cached; nothing goes out
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    from PIL import Image

    manifest = json.loads(Path(a.manifest).read_text())
    files = {p.stem: p for p in Path(a.images).iterdir() if p.is_file()}
    repo_root = Path(__file__).resolve().parents[2]
    if Path(a.images).resolve().is_relative_to(repo_root):
        print("refusing: keep source images outside the repository")
        return 2
    ids = [i["id"] for i in manifest["items"] if i["id"] in files]
    missing = len(manifest["items"]) - len(ids)
    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for n in names:
        m = load(n, revisions.get(n))
        vecs = {}
        for i in range(0, len(ids), 16):
            chunk = ids[i : i + 16]
            ims = [Image.open(files[x]).convert("RGB") for x in chunk]
            for x, v in zip(chunk, m.embed(ims)):
                vecs[x] = [round(f, 6) for f in v]
        (out_dir / f"{n}.json").write_text(json.dumps(vecs) + "\n")
        print(f"{n}: {len(vecs)} embeddings ({missing} manifest items had no local image) → {out_dir / (n + '.json')}  approval: {a.approval_ref}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
