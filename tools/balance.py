#!/usr/bin/env python3
"""Card value balancing for every collection in collections.json.

Formula (2026-11-28, Nicolas asked for a mathematical rule):

  p(S, r)  = chance that one booster of collection S holds one given card of rarity r
           = sum over slots of (count x share of r in the slot) / number of r cards in S
  v(S, r)  = V(r) x sqrt(P(r) / p(S, r)) x k(S)

  V(r), P(r): the rarity's anchor value and per-card chance in its anchor
  collection (ANCHORS below). A card twice as hard to pull as its anchor is
  worth sqrt(2) = 1.41x more.
  k(S): one factor per collection so that a booster's expected card value is
  the same multiple of its wholesale price as a Base Set booster (EV / price).
  Before k, each rarity is raised to at least 1.25x the rarity below it, so a
  rarer card never sells for less (e.g. a set with only 3 ex cards).
  Base Set is the reference, so its values do not change.

Writes rarities[r].value in each collection file (cents) and prints a table.
Per-card `value` overrides and reprints (reprintFactor) are left alone.

Usage: python -X utf8 tools/balance.py          (writes)
       python -X utf8 tools/balance.py --check  (exit 1 if a file is off)
"""
import json
import sys
from math import sqrt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# rarity -> (anchor collection, anchor value)
ANCHORS = {
    "common": ("base", 0.15),
    "uncommon": ("base", 0.4),
    "rare": ("base", 3),
    "holo": ("base", 12),
    "secret": ("team-rocket", 40),
    "ex": ("ruby-sapphire", 20),
    "star": ("team-rocket-returns", 60),
}
REFERENCE = "base"
SCARCITY_EXPONENT = 0.5
MIN_STEP = 1.25  # a rarer rarity is never worth less than 1.25x the one below it


def per_pack(coll):
    """rarity -> expected copies of that rarity per booster."""
    out = {}
    for s in coll["booster"]["slots"]:
        n = s.get("count", 1)
        shares = {s["rarity"]: 1} if s.get("rarity") else s.get("weights", {})
        tot = sum(shares.values()) or 1
        for r, w in shares.items():
            out[r] = out.get(r, 0) + n * w / tot
    return out


def counts(coll):
    c = {}
    for card in coll["cards"]:
        c[card["rarity"]] = c.get(card["rarity"], 0) + 1
    return c


def chance(coll):
    pp, n = per_pack(coll), counts(coll)
    return {r: pp[r] / n[r] for r in pp if n.get(r)}


def ev(coll, values):
    pp, n = per_pack(coll), counts(coll)
    return sum(pp[r] * values[r] for r in pp if n.get(r))


def main():
    check = "--check" in sys.argv
    files = json.loads((ROOT / "collections.json").read_text(encoding="utf-8"))["collections"]
    colls = {}
    for f in files:
        c = json.loads((ROOT / f).read_text(encoding="utf-8"))
        colls[c["id"]] = (f, c)
    anchor_p = {r: chance(colls[a][1])[r] for r, (a, _) in ANCHORS.items()}
    ref = colls[REFERENCE][1]
    ref_vals = {r: ANCHORS[r][1] for r in ref["rarities"]}
    ratio = ev(ref, ref_vals) / ref["booster"]["wholesalePrice"]
    bad = []
    print(f"reference EV/price: {ratio:.3f}")
    for cid, (f, c) in colls.items():
        p = chance(c)
        raw = {r: ANCHORS[r][1] * (anchor_p[r] / p[r]) ** SCARCITY_EXPONENT for r in c["rarities"] if r in p}
        prev = None
        for r in raw:  # rarities in rank order: each one worth at least STEP x the one below
            if prev is not None:
                raw[r] = max(raw[r], raw[prev] * MIN_STEP)
            prev = r
        k = ratio * c["booster"]["wholesalePrice"] / ev(c, raw)
        vals = {r: round(v * k, 2) for r, v in raw.items()}
        line = " ".join(f"{r}={v:g}" for r, v in vals.items())
        print(f"{cid:24} k={k:.3f} EV=${ev(c, vals):.2f}  {line}")
        if any(c["rarities"][r]["value"] != v for r, v in vals.items()):
            bad.append(cid)
            for r, v in vals.items():
                c["rarities"][r]["value"] = v
            if not check:
                (ROOT / f).write_text(json.dumps(c, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if check and bad:
        print("out of balance:", ", ".join(bad))
        sys.exit(1)


if __name__ == "__main__":
    main()
