"""Artwork window of every foil card, for the rarity foil shader.

Writes desktop/data/foil_rects.json: {set id: {card id: [x, y, w, h]}} in UV
(0-1 of the scan). Only cards whose rarity has a foil (holo, ex, secret, star).

How: the median window of each set is the template; each edge then snaps to
the strongest straight line within 2% of it, because every scan is cropped a
little differently. A weak edge keeps the template. Energy cards are full art:
their window is the whole card inside the border. Hand fixes go in
desktop/data/foil_overrides.json (same shape) and win over detection.

Run from the repo root after adding or changing a collection:
    python -X utf8 desktop/tools/foil_rects.py
Needs numpy and Pillow.
"""
import json
import os
import statistics
import numpy as np
from PIL import Image

FOIL = ("holo", "ex", "secret", "star")
FULL = [0.05, 0.035, 0.90, 0.93]  # inside the card border
OUT = "desktop/data/foil_rects.json"
OVERRIDES = "desktop/data/foil_overrides.json"
W = 300  # analysis width in pixels
EDGE = 40  # colour step that counts as an edge
WEAK = 0.25  # share of the edge length that must be an edge


def load(path):
    im = Image.open(path).convert("RGB")
    h = int(W * im.height / im.width)
    a = np.asarray(im.resize((W, h)), dtype=np.float32)
    dy = np.abs(np.diff(a, axis=0)).max(axis=2) > EDGE
    dx = np.abs(np.diff(a, axis=1)).max(axis=2) > EDGE
    return dy, dx, h


def row(dy, h, lo, hi, x0, x1):
    y0, y1 = max(int(lo * h), 0), min(int(hi * h) + 1, dy.shape[0])
    b = np.convolve(dy[y0:y1, int(x0 * W):int(x1 * W)].mean(axis=1), np.ones(3) / 3, "same")
    i = int(np.argmax(b))
    return (y0 + i + 1) / h, float(b[i])


def col(dx, h, lo, hi, y0, y1):
    x0, x1 = max(int(lo * W), 0), min(int(hi * W) + 1, dx.shape[1])
    b = np.convolve(dx[int(y0 * h):int(y1 * h), x0:x1].mean(axis=0), np.ones(3) / 3, "same")
    i = int(np.argmax(b))
    return (x0 + i + 1) / W, float(b[i])


def find(img, near=None, tol=0.02):
    """Window edges [left, top, right, bottom]: wide search, or near a template."""
    dy, dx, h = img
    if near is None:
        t = row(dy, h, 0.07, 0.17, 0.2, 0.8)
        b = row(dy, h, 0.40, 0.64, 0.2, 0.8)
        l = col(dx, h, 0.03, 0.16, t[0] + 0.05, b[0] - 0.05)
        r = col(dx, h, 0.84, 0.97, t[0] + 0.05, b[0] - 0.05)
        return [l[0], t[0], r[0], b[0]]
    L, T, R, B = near
    t = row(dy, h, T - tol, T + tol, L + 0.1, R - 0.1)
    b = row(dy, h, B - tol, B + tol, L + 0.1, R - 0.1)
    top = t[0] if t[1] >= WEAK else T
    bot = b[0] if b[1] >= WEAK else B
    l = col(dx, h, L - tol, L + tol, top + 0.05, bot - 0.05)
    r = col(dx, h, R - tol, R + tol, top + 0.05, bot - 0.05)
    return [l[0] if l[1] >= WEAK else L, top, r[0] if r[1] >= WEAK else R, bot]


def main():
    out = {}
    overrides = json.load(open(OVERRIDES, encoding="utf-8")) if os.path.exists(OVERRIDES) else {}
    for f in json.load(open("collections.json", encoding="utf-8"))["collections"]:
        cs = json.load(open(f, encoding="utf-8"))
        cards = [c for c in cs["cards"] if c["rarity"] in FOIL and os.path.exists(c.get("image", ""))]
        imgs = {c["id"]: load(c["image"]) for c in cards if not c["name"].endswith("Energy")}
        first = {i: find(img) for i, img in imgs.items()}
        tpl = [statistics.median(e[k] for e in first.values()) for k in range(4)] if first else None
        rects = {}
        for c in cards:
            if c["id"] not in imgs:
                rects[c["id"]] = FULL
                continue
            l, t, r, b = find(imgs[c["id"]], tpl)
            rects[c["id"]] = [round(l, 4), round(t, 4), round(r - l, 4), round(b - t, 4)]
        rects.update(overrides.get(cs["id"], {}))
        out[cs["id"]] = rects
        print(f"{cs['id']}: {len(rects)} cards")
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("{\n" + ",\n".join(
            '"%s": {%s}' % (sid, ", ".join('"%s": %s' % (cid, json.dumps(r)) for cid, r in rs.items()))
            for sid, rs in out.items()) + "\n}\n")


if __name__ == "__main__":
    main()
