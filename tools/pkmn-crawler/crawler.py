#!/usr/bin/env python3
"""pkmncards.com set crawler for IdleCardShop (Nicolas's tool, run at his request).

Downloads the card images, writes the raw data to cards-<id>.json and builds
<id>.json in the game's collection format (GDD section 4).
Standard library only. Everything goes to the work folder
(tools/pkmn-crawler/work, ignored by git); the pkmn-crawler skill installs it.

Usage:
  python -X utf8 tools/pkmn-crawler/crawler.py "<set URL>" --id neo-genesis --name "Neo Genesis" --template tools/pkmn-crawler/header.json
  python -X utf8 tools/pkmn-crawler/crawler.py --from-raw tools/pkmn-crawler/work/cards-neo-genesis.json --id neo-genesis ...   (no network)
"""
import argparse
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

URL = "https://pkmncards.com/set/base-set/?sort=date&ord=auto&display=full"
UA = "Mozilla/5.0 (compatible; pkmn-crawler/1.0)"
OUT = Path(__file__).parent / "work"
IMG_DIR = OUT / "images"
DELAY = 0.3  # seconds between downloads (be polite to the server)


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            return data if binary else data.decode("utf-8")
        except Exception as e:
            if attempt == 2:
                raise
            print(f"  retry ({e})")
            time.sleep(2)


def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def first(pattern, s, flags=re.S):
    m = re.search(pattern, s, flags)
    return m.group(1) if m else None


def load_dex():
    """species slug -> National Pokedex number (PokeAPI)."""
    data = json.loads(get("https://pokeapi.co/api/v2/pokemon-species?limit=2000"))
    dex = {r["name"]: int(r["url"].rstrip("/").rsplit("/", 1)[1]) for r in data["results"]}
    dex["nidoran-male"], dex["nidoran-female"] = dex["nidoran-m"], dex["nidoran-f"]  # pkmncards spelling
    return dex


def parse(page, dex):
    cards = []
    for art in re.findall(r"<article.*?</article>", page, re.S):
        img = first(r'<a href="([^"]+)"[^>]*class="card-image-link"', art)
        fname = first(r'title="Download Image" download="([^"]+)"', art)
        title = text(first(r'<h2 class="card-title".*?<span>(.*?)</span>', art) or "")
        name = text(first(r'<span class="name"[^>]*>(.*?)</span>', art) or title)
        number = text(first(r'<span class="number">(.*?)</span>', art) or "")
        rarity = text(first(r'<span class="rarity">(.*?)</span>', art) or "")
        ctype = text(first(r'<span class="type"[^>]*>(.*?)</span>', art) or "")
        species = first(r'<span class="pokemon"[^>]*><a href="[^"]*/pokemon/([^/"]+)/', art)
        cards.append({
            "name": name,
            "pokedex_number": dex.get(species) if species else None,
            "card_number": int(number) if number.isdigit() else number,
            "rarity": rarity,
            "type": ctype,  # Pokemon / Trainer / Energy
            "image_url": img,
            "image_file": f"images/{fname}" if fname else None,
            "card_url": first(r'<h2 class="card-title".*?<a href="([^"]+)"', art),
        })
    return cards


# --- Conversion to the game collection format ---------------------------------

# pkmncards rarity -> key of `rarities` in the game. Rarities not in this table
# become a slug (e.g. "Rare Holo EX" -> "rare-holo-ex") and are reported.
# Override with --rarity "No Rarity=energy".
RARITY_MAP = {
    "Common": "common",
    "Uncommon": "uncommon",
    "Rare": "rare",
    "Rare Holo": "holo",
    "Rare Secret": "secret",  # rarer than holo (Nicolas, 2026-11-27)
    "No Rarity": "common",  # basic energies count as common (Nicolas, 2026-11-27)
}
RARITY_ORDER = ["common", "uncommon", "rare", "holo", "secret"]  # without a template: most common -> rarest
# Card fields the crawler does not know, kept from the template.
KEEP_FROM_TEMPLATE = ("value", "reprintOf", "image")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def card_id(number):
    """Same format as base.json ("001"); ids never change once published."""
    return f"{number:03d}" if isinstance(number, int) else slug(str(number))


def placeholder_header(coll_id, name, rarity_keys):
    """Minimal header without a template. The values are TODO for Nicolas."""
    order = [k for k in RARITY_ORDER if k in rarity_keys] + sorted(k for k in rarity_keys if k not in RARITY_ORDER)
    return {
        "id": coll_id,
        "name": name,
        "game": "pokemon",
        "theme": "pokemon",
        "booster": {"wholesalePrice": 0, "slots": []},
        "rarities": {k: {"name": k.replace("-", " ").title(), "value": 0} for k in order},
    }


def to_collection(raw, args, warnings):
    rarity_map = dict(RARITY_MAP)
    for pair in args.rarity or []:
        src, _, dst = pair.partition("=")
        rarity_map[src.strip()] = dst.strip()

    template = json.loads(Path(args.template).read_text(encoding="utf-8")) if args.template else None
    coll_id = args.id or (template or {}).get("id")
    if not coll_id:
        raise SystemExit("Give --id (or a --template that has an id).")
    old_cards = {c["id"]: c for c in (template or {}).get("cards", [])}

    numeric = [c["card_number"] for c in raw if isinstance(c["card_number"], int)]
    total = args.printed_total or len(numeric)
    cards = []
    for i, c in enumerate(raw, 1):
        rarity = rarity_map.get(c["rarity"]) or slug(c["rarity"] or "unknown")
        if c["rarity"] not in rarity_map:
            warnings.append(f"unmapped rarity '{c['rarity']}' -> '{rarity}' ({c['name']})")
        n = c["card_number"]
        card = {
            "index": i,
            "id": card_id(n),
            "number": f"{n}/{total}" if isinstance(n, int) else str(n),
            "name": c["name"],
            "rarity": rarity,
        }
        if "holo" in (c["rarity"] or "").lower():
            card["foil"] = True
        if c.get("image_file"):
            card["image"] = f"images/{coll_id}/{Path(c['image_file']).name}"
        extra = {k: v for k, v in (("type", c.get("type")), ("pokedexNumber", c.get("pokedex_number"))) if v is not None}
        if extra:
            card["extra"] = extra
        old = old_cards.get(card["id"])
        for k in KEEP_FROM_TEMPLATE:
            if old and k in old and k not in card:
                card[k] = old[k]
        cards.append(card)

    ids = [c["id"] for c in cards]
    for dup in sorted({x for x in ids if ids.count(x) > 1}):
        warnings.append(f"duplicate card id: {dup}")
    missing = [k for k in old_cards if k not in set(ids)]
    if missing:
        warnings.append(f"{len(missing)} template card(s) are gone (affects saves): {', '.join(missing[:10])}")

    rarity_keys = {c["rarity"] for c in cards}
    if template:
        header = {k: v for k, v in template.items() if k != "cards"}
        header["id"] = coll_id
        if args.name:
            header["name"] = args.name
        for k in sorted(rarity_keys - set(header.get("rarities", {}))):
            warnings.append(f"rarity '{k}' is not in the template's rarities; the game will skip these cards")
    else:
        header = placeholder_header(coll_id, args.name or coll_id.replace("-", " ").title(), rarity_keys)
        warnings.append("no --template: fill in booster.wholesalePrice, booster.slots and the rarities' value/color/short")
    no_img = [c["id"] for c in cards if "image" not in c]
    if no_img:
        warnings.append(f"{len(no_img)} card(s) without an image: {', '.join(no_img[:10])}")
    return {**header, "cards": cards}


def parse_args():
    p = argparse.ArgumentParser(description="pkmncards.com crawler -> IdleCardShop collection")
    p.add_argument("url", nargs="?", default=URL, help="set link on pkmncards.com")
    p.add_argument("--id", help="permanent collection id in the game (e.g. base)")
    p.add_argument("--name", help="display name (default: the template's)")
    p.add_argument("--template", help="existing collection JSON: copies booster/rarities and keeps value/reprintOf")
    p.add_argument("--rarity", action="append", metavar="SOURCE=KEY", help="overrides the rarity mapping")
    p.add_argument("--printed-total", type=int, help="printed total in the number (e.g. 102 in 4/102)")
    p.add_argument("--from-raw", metavar="CARDS_JSON", help="no network; converts a raw cards JSON already downloaded")
    p.add_argument("--out", help="output file (default: <id>.json in the work folder)")
    return p.parse_args()


def main():
    args = parse_args()
    if args.from_raw:
        cards = json.loads(Path(args.from_raw).read_text(encoding="utf-8"))
    else:
        cards = crawl(args.url, args.id)
    warnings = []
    collection = to_collection(cards, args, warnings)
    out = Path(args.out) if args.out else OUT / f"{collection['id']}.json"
    out.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{out} saved: {len(collection['cards'])} cards")
    print(f"Copy its images from {IMG_DIR} to <game>/images/{collection['id']}/")
    for w in warnings:
        print(f"  WARNING: {w}")


def crawl(url, coll_id):
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    print("Fetching page...")
    page = get(url)
    print("Loading the Pokedex map (PokeAPI)...")
    cards = parse(page, load_dex())
    print(f"{len(cards)} cards found")
    for i, c in enumerate(cards, 1):
        if not c["image_url"] or not c["image_file"]:
            print(f"[{i}] no image: {c['name']}")
            continue
        dest = OUT / c["image_file"]
        if dest.exists() and dest.stat().st_size > 0:
            continue
        dest.write_bytes(get(c["image_url"], binary=True))
        print(f"[{i}/{len(cards)}] {dest.name}")
        time.sleep(DELAY)
    cards.sort(key=lambda c: (isinstance(c["card_number"], str), c["card_number"]))
    raw = OUT / f"cards-{coll_id or 'set'}.json"
    raw.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{raw.name} saved (raw data)")
    return cards


if __name__ == "__main__":
    main()
