#!/usr/bin/env python3
"""
Stage 2 image pilot: bounded, logged download of manifest product photos, duplicate fingerprints,
and deletion. NOT RUN until image permissions P2 (temporary copies) and P3 (derived data) are
recorded in docs/vision/IMAGE_PERMISSIONS.md.

  python fetch_images.py fetch --manifest ../../data/vision-eval/manifest-v2.json --out /tmp/cureavo-pilot \
        --approval-ref "IMAGE_PERMISSIONS.md A2 (P2+P3, <date>)" [--max 600] [--width 512]
  python fetch_images.py hashes --images /tmp/cureavo-pilot --out-candidates dup-candidates.json
  python fetch_images.py purge --images /tmp/cureavo-pilot

Rules enforced here:
  - refuses without --approval-ref; refuses an output folder inside the repository;
  - at most --max images (default and hard cap 600), only manifest products, only the store's own
    image CDN (cdn.shopify.com), at a bounded width (default 512 px, requested from the CDN);
  - polite pacing (one request at a time, 0.5 s apart; 429/503 back off 15 s);
  - provenance.jsonl: product id, store, source URL, bytes, SHA-256, time, approval reference;
  - nothing is sent anywhere else; images never go to a hosted AI service;
  - purge deletes every image and appends a deletion record (what, when, how many).
Standard library + Pillow only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HARD_CAP = 600
ALLOWED_HOSTS = {"cdn.shopify.com"}
REPO = Path(__file__).resolve().parents[2]


def bounded(url: str, width: int) -> str:
    u = urllib.parse.urlsplit(url)
    q = [(k, v) for k, v in urllib.parse.parse_qsl(u.query) if k != "width"] + [("width", str(width))]
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, urllib.parse.urlencode(q), ""))


def outside_repo(p: Path) -> bool:
    try:
        p.resolve().relative_to(REPO)
        return False
    except ValueError:
        return True


def fetch(a) -> int:
    if not a.approval_ref:
        print("REFUSED: needs --approval-ref (recorded P2+P3 approval in docs/vision/IMAGE_PERMISSIONS.md)")
        return 2
    out = Path(a.out)
    if not outside_repo(out):
        print("REFUSED: keep images outside the repository")
        return 2
    cap = min(a.max, HARD_CAP)
    manifest = json.loads(Path(a.manifest).read_text())
    out.mkdir(parents=True, exist_ok=True)
    log = out / "provenance.jsonl"
    done = {json.loads(l)["id"] for l in log.read_text().splitlines()} if log.exists() else set()
    n = len(done)
    for item in manifest["items"]:
        if n >= cap:
            break
        if item["id"] in done:
            continue
        src = item["photoUrl"]
        host = urllib.parse.urlsplit(src).hostname or ""
        if host not in ALLOWED_HOSTS:
            print(f"skip {item['id']}: host {host} not allowed")
            continue
        url = bounded(src, a.width)
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "cureavo-research-pilot/1.0"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = r.read()
                    ctype = r.headers.get("Content-Type", "")
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 503) and attempt < 2:
                    time.sleep(15)
                    continue
                print(f"fail {item['id']}: HTTP {e.code}")
                data = None
                break
        if not data:
            continue
        ext = ".png" if "png" in ctype else ".webp" if "webp" in ctype else ".jpg"
        (out / f"{item['id']}{ext}").write_bytes(data)
        rec = {
            "id": item["id"],
            "retailerId": item["retailerId"],
            "split": item["split"],
            "source": url,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "approvalRef": a.approval_ref,
        }
        with log.open("a") as f:
            f.write(json.dumps(rec) + "\n")
        n += 1
        time.sleep(0.5)
    print(f"{n} images in {out} (cap {cap}); provenance in {log}")
    return 0


def dhash(path: Path, size: int = 8) -> int:
    from PIL import Image

    im = Image.open(path).convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    px = list(im.tobytes())  # one byte per pixel in "L" mode
    bits = 0
    for row in range(size):
        for col in range(size):
            bits = (bits << 1) | (px[row * (size + 1) + col] > px[row * (size + 1) + col + 1])
    return bits


def hashes(a) -> int:
    """Difference hashes; pairs within Hamming distance --max-distance become duplicate CANDIDATES
    for human review (they're merged only once a person confirms them)."""
    imgs = sorted(p for p in Path(a.images).iterdir() if p.suffix in (".jpg", ".png", ".webp"))
    hs = {p.stem: dhash(p) for p in imgs}
    ids = sorted(hs)
    pairs = []
    for i, x in enumerate(ids):
        for y in ids[i + 1 :]:
            d = bin(hs[x] ^ hs[y]).count("1")
            if d <= a.max_distance:
                pairs.append({"a": x, "b": y, "distance": d})
    Path(a.out_candidates).write_text(json.dumps({"method": "dHash 64-bit", "maxDistance": a.max_distance, "hashes": {k: f"{v:016x}" for k, v in hs.items()}, "candidatePairs": pairs}, indent=1) + "\n")
    print(f"{len(hs)} images hashed; {len(pairs)} candidate duplicate pairs (distance ≤ {a.max_distance}) → {a.out_candidates}")
    return 0


def purge(a) -> int:
    d = Path(a.images)
    if not outside_repo(d):
        print("REFUSED: not an image folder outside the repository")
        return 2
    removed = 0
    for p in d.iterdir():
        if p.suffix in (".jpg", ".png", ".webp"):
            p.unlink()
            removed += 1
    with (d / "provenance.jsonl").open("a") as f:
        f.write(json.dumps({"deleted": removed, "deletedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}) + "\n")
    print(f"deleted {removed} images from {d}; deletion recorded in provenance.jsonl")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--manifest", required=True)
    f.add_argument("--out", required=True)
    f.add_argument("--approval-ref")
    f.add_argument("--max", type=int, default=HARD_CAP)
    f.add_argument("--width", type=int, default=512)
    h = sub.add_parser("hashes")
    h.add_argument("--images", required=True)
    h.add_argument("--out-candidates", required=True)
    h.add_argument("--max-distance", type=int, default=6)
    p = sub.add_parser("purge")
    p.add_argument("--images", required=True)
    a = ap.parse_args()
    return {"fetch": fetch, "hashes": hashes, "purge": purge}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
