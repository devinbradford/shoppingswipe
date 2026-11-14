#!/usr/bin/env python3
"""
Visual-model pilot harness (V3 Milestone 1). Offline, CPU, isolated from the app.

  python measure_models.py --self-test
      Checks this harness with a tiny built-in stand-in model (no downloads, no torch needed).

  python measure_models.py --measure [--models siglip2-b,marqo-ecom-b,dinov2-b,openclip-b32] [--out results.json]
      Stage 1, allowed now: downloads the open model weights once (Hugging Face), then measures
      size, load time, peak memory, speed and run-to-run reproducibility on SYNTHETIC drawn images
      only. No retailer image is read.

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

# The candidate models. `revision` should be pinned to a commit hash after the first download
# (models.lock.json is written by --measure with the resolved commit of each).
MODELS = {
    "siglip2-b": {"kind": "hf", "repo": "google/siglip2-base-patch16-224", "note": "SigLIP 2 Base/16, 224 px"},
    "marqo-ecom-b": {"kind": "open_clip", "repo": "hf-hub:Marqo/marqo-ecommerce-embeddings-B", "note": "Marqo e-commerce B (ViT-B/16 SigLIP)"},
    "dinov2-b": {"kind": "hf", "repo": "facebook/dinov2-base", "note": "DINOv2 Base/14, image only (CLS)"},
    "openclip-b32": {"kind": "open_clip", "repo": "ViT-B-32", "pretrained": "laion2b_s34b_b79k", "note": "OpenCLIP ViT-B/32 LAION-2B"},
    "marqo-ecom-l": {"kind": "open_clip", "repo": "hf-hub:Marqo/marqo-ecommerce-embeddings-L", "note": "optional, large"},
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

    spec = MODELS[name]
    if spec["kind"] == "hf":
        from huggingface_hub import snapshot_download
        from transformers import AutoImageProcessor, AutoModel

        path = snapshot_download(spec["repo"], revision=revision, allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model"])
        model = AutoModel.from_pretrained(path).eval()
        proc = AutoImageProcessor.from_pretrained(path)
        rev = Path(path).name

        def embed(images):
            with torch.inference_mode():
                inputs = proc(images=images, return_tensors="pt")
                if hasattr(model, "get_image_features"):
                    v = model.get_image_features(**inputs)
                else:  # DINOv2: CLS token
                    v = model(**inputs).last_hidden_state[:, 0]
                v = getattr(v, "pooler_output", v)
                return torch.nn.functional.normalize(v.float(), dim=-1).tolist()

    else:
        import open_clip

        model, _, preprocess = open_clip.create_model_and_transforms(spec["repo"], pretrained=spec.get("pretrained"))
        model.eval()
        path = None
        rev = spec.get("pretrained") or "hf-hub"

        def embed(images):
            with torch.inference_mode():
                x = torch.stack([preprocess(im) for im in images])
                return torch.nn.functional.normalize(model.encode_image(x).float(), dim=-1).tolist()

    params = sum(p.numel() for p in model.parameters())
    files_mb = sum(f.stat().st_size for f in Path(path).rglob("*") if f.is_file()) / 2**20 if path else params * 4 / 2**20
    return Loaded(embed=embed, params=params, files_mb=files_mb, revision=rev)


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
    ap.add_argument("--models", default=",".join(DEFAULT))
    ap.add_argument("--revision", action="append", default=[], help="name=commit (pin a model revision)")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--images", help="Stage 2: directory of local images named <product id>.<ext>")
    ap.add_argument("--manifest")
    ap.add_argument("--approval-ref", help="Stage 2: where the written image-use approval is recorded")
    ap.add_argument("--out", default="results.json")
    ap.add_argument("--out-dir", default="emb")
    a = ap.parse_args()
    if a.self_test:
        return self_test()

    names = [n for n in a.models.split(",") if n]
    unknown = [n for n in names if n not in MODELS]
    if unknown:
        print(f"unknown models: {unknown}; choose from {list(MODELS)}")
        return 2
    revisions = dict(r.split("=", 1) for r in a.revision)
    configure_determinism(a.threads)

    if a.measure:
        images = synthetic_images(64)
        results, lock = [], {}
        for n in names:
            print(f"measuring {n} …", flush=True)
            r = measure_one(n, lambda n=n: load(n, revisions.get(n)), images)
            results.append(r)
            lock[n] = {"repo": MODELS[n]["repo"], "revision": r["revision"]}
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
