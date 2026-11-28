"""Builds the game's PNG sheets from the hand-drawn text grids in art/src.

Run from the repo root when a grid changes (Python 3, standard library only):
    python desktop/tools/build_art.py
The game never runs this: it only loads the PNGs in art/sheets.
"""
import json, os, re, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'art', 'src')
OUT = os.path.join(HERE, '..', 'art', 'sheets')


def write_png(path, w, h, rgba):
    raw = b''.join(b'\x00' + bytes(rgba[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def pack(sprites, max_w=256):
    """Shelf packing, tallest first. sprites: name -> rows of RGBA tuples."""
    order = sorted(sprites, key=lambda n: (-len(sprites[n]), n))
    x = y = shelf = 0
    pos = {}
    for n in order:
        rows = sprites[n]
        w, h = len(rows[0]), len(rows)
        if x + w > max_w:
            x, y, shelf = 0, y + shelf + 1, 0
        pos[n] = (x, y, w, h)
        x += w + 1
        shelf = max(shelf, h)
    W = max_w
    H = y + shelf
    px = bytearray(W * H * 4)
    for n, (x0, y0, w, h) in pos.items():
        for yy, row in enumerate(sprites[n]):
            for xx, c in enumerate(row):
                i = ((y0 + yy) * W + x0 + xx) * 4
                px[i:i + 4] = bytes(c)
    return W, H, px, pos


def hex_rgba(h):
    h = h.lstrip('#')
    a = int(h[6:8], 16) if len(h) == 8 else 255
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def read_blocks(path):
    pal, blocks, cur = {}, [], None
    for line in open(path, encoding='utf8'):
        line = line.rstrip('\n')
        if not line or line.startswith('#') and cur is None and not re.match(r'^[#.]+$', line):
            continue
        if line.startswith('! '):
            _, ch, col = line.split()
            pal[ch] = hex_rgba(col)
        elif line.startswith('= '):
            cur = [line[2:].strip(), []]
            blocks.append(cur)
        elif cur is not None:
            cur[1].append(line)
    for name, rows in blocks:
        widths = {len(r) for r in rows}
        assert len(widths) == 1, f'{path}: {name} has rows of widths {widths}'
    return pal, blocks


def build_font():
    _, blocks = read_blocks(os.path.join(SRC, 'font.txt'))
    sprites, meta = {}, {}
    for name, rows in blocks:
        assert len(rows) == 9, f'font glyph {name} has {len(rows)} rows'
        ch = chr(int(name[2:], 16)) if name.startswith('U+') else name
        key = f'g{ord(ch):05x}'
        sprites[key] = [[(255, 255, 255, 255) if c == '#' else (0, 0, 0, 0) for c in r] for r in rows]
        meta[key] = ch
    W, H, px, pos = pack(sprites, 128)
    write_png(os.path.join(OUT, 'font.png'), W, H, px)
    glyphs = {str(ord(meta[k])): list(v) for k, v in pos.items()}
    with open(os.path.join(OUT, 'font.json'), 'w') as f:
        json.dump({'height': 9, 'ascent': 7, 'glyphs': glyphs}, f, separators=(',', ':'))
    return len(glyphs)


def build_sheet(name):
    pal, blocks = read_blocks(os.path.join(SRC, name + '.txt'))
    sprites = {}
    for sname, rows in blocks:
        sprites[sname] = [[(0, 0, 0, 0) if c == '.' else pal[c] for c in r] for r in rows]
    W, H, px, pos = pack(sprites, 256)
    write_png(os.path.join(OUT, name + '.png'), W, H, px)
    with open(os.path.join(OUT, name + '.json'), 'w') as f:
        json.dump({k: list(v) for k, v in sorted(pos.items())}, f, separators=(',', ':'))
    return len(sprites)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    print('font:', build_font(), 'glyphs')
    for sheet in ('shop', 'ui'):
        print(sheet + ':', build_sheet(sheet), 'sprites')
