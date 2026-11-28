"""Draws the placeholder customer sprite sheets (original pixel art, GBA-like).

Run from the repo root:  python tools/make_customers.py
Writes images/sprites/customer-1.png ... customer-12.png.

Sheet layout (docs/sdd/shop-floor.md): frames of 16x32 px, 4 columns x 5 rows.
  row 0 walk down, row 1 walk up, row 2 walk left, row 3 walk right
        columns: stand, step A, stand, step B
  row 4 emotes, facing down: happy 1, happy 2, sad 1, sad 2
Transparent background, 1 px dark outline, limited palette per customer.
No dependencies: the PNG writer is below.
"""
import os
import struct
import zlib

W, H = 16, 32
COLS, ROWS = 4, 5
OUTLINE = (42, 31, 26, 255)
EYE = (34, 28, 30, 255)
WHITE = (250, 246, 236, 255)

# Customers: skin, hair, top, bottom, shoes, features.
CUSTOMERS = [
    # Kid with a cap
    dict(skin=(246, 204, 160), hair=(120, 72, 40), cap=(204, 64, 56), top=(240, 196, 64), bottom=(64, 104, 176),
         shoes=(90, 60, 50), shorts=True),
    # Collector with glasses
    dict(skin=(232, 190, 150), hair=(168, 168, 160), top=(80, 136, 88), bottom=(110, 84, 64),
         shoes=(60, 46, 40), glasses=True, bald=True),
    # Student with long hair
    dict(skin=(214, 160, 118), hair=(46, 36, 40), top=(128, 88, 168), bottom=(52, 52, 64),
         shoes=(200, 200, 200), longhair=True),
    # Gamer with spiky hair
    dict(skin=(160, 108, 74), hair=(232, 120, 40), top=(56, 112, 184), bottom=(120, 120, 128),
         shoes=(220, 64, 56), spiky=True),
    # Woman with a ponytail and a skirt
    dict(skin=(250, 214, 178), hair=(236, 196, 92), top=(232, 128, 152), bottom=(56, 152, 148),
         shoes=(120, 64, 80), ponytail=True, skirt=True),
    # Grandpa with a beard and a cardigan
    dict(skin=(240, 200, 168), hair=(220, 220, 214), top=(176, 120, 72), bottom=(72, 72, 88),
         shoes=(70, 50, 40), bald=True, beard=True),
    # Teen in a beanie
    dict(skin=(198, 140, 100), hair=(60, 40, 30), beanie=(52, 140, 96), top=(230, 230, 222), bottom=(48, 64, 110),
         shoes=(240, 240, 240)),
    # Woman with a bun
    dict(skin=(120, 80, 58), hair=(30, 24, 26), top=(240, 176, 72), bottom=(92, 60, 120),
         shoes=(200, 90, 70), bun=True),
    # Curly-haired collector
    dict(skin=(150, 100, 70), hair=(36, 26, 22), top=(196, 72, 72), bottom=(64, 80, 96),
         shoes=(40, 40, 44), curly=True),
    # Kid in a hoodie
    dict(skin=(250, 220, 190), hair=(200, 120, 60), top=(110, 170, 220), bottom=(70, 70, 80),
         shoes=(240, 200, 60), shorts=True, hood=True),
    # Businessperson with a tie
    dict(skin=(226, 180, 140), hair=(80, 56, 40), top=(56, 60, 76), bottom=(48, 50, 62),
         shoes=(30, 28, 30), tie=(196, 56, 64)),
    # Punk with a pink mohawk
    dict(skin=(244, 206, 176), hair=(232, 96, 168), top=(40, 38, 44), bottom=(80, 90, 120),
         shoes=(30, 30, 34), mohawk=True),
]


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c[:3]) + (255,)


def rgba(c):
    return tuple(c[:3]) + (255,)


class Frame:
    def __init__(self):
        self.px = [[None] * W for _ in range(H)]

    def set(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.px[y][x] = rgba(c)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def outline(self):
        out = [row[:] for row in self.px]
        for y in range(H):
            for x in range(W):
                if self.px[y][x] is not None:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and self.px[ny][nx] is not None and self.px[ny][nx] != OUTLINE:
                        out[y][x] = OUTLINE
                        break
        self.px = out

    def shifted(self, dy):
        f = Frame()
        for y in range(H):
            for x in range(W):
                if self.px[y][x] is not None and 0 <= y + dy < H:
                    f.px[y + dy][x] = self.px[y][x]
        return f

    def mirrored(self):
        f = Frame()
        for y in range(H):
            f.px[y] = list(reversed(self.px[y]))
        return f


def legs_front(f, p, step):
    """step: 0 stand, 1 left leg up, 2 right leg up."""
    bottom, shoes = p['bottom'], p['shoes']
    ly = 28 - (2 if step == 1 else 0)
    ry = 28 - (2 if step == 2 else 0)
    top = 22
    if p.get('skirt'):
        f.rect(4, 21, 11, 24, bottom)
        f.rect(5, 25, 6, ly, p['skin']); f.rect(9, 25, 10, ry, p['skin'])
    elif p.get('shorts'):
        f.rect(5, top, 7, 24, bottom); f.rect(8, top, 10, 24, bottom)
        f.rect(5, 25, 6, ly, p['skin']); f.rect(9, 25, 10, ry, p['skin'])
    else:
        f.rect(5, top, 7, ly, bottom); f.rect(8, top, 10, ry, bottom)
        f.set(7, ly, shade(bottom, .8)); f.set(8, ry, shade(bottom, .8))
    f.rect(4, ly + 1, 7, ly + 2, shoes)
    f.rect(8, ry + 1, 11, ry + 2, shoes)


def body_front(f, p, arms='down', step=0, back=False):
    top = p['top']
    f.rect(4, 13, 11, 21, top)
    f.rect(5, 13, 10, 13, shade(top, 1.12))
    if back:
        # From behind: no neckline, shirt, tie or hood strings.
        if p.get('hood'):
            f.rect(5, 12, 10, 14, shade(top, .85))
    else:
        f.set(7, 13, p['skin']); f.set(8, 13, p['skin'])       # neckline
    if p.get('tie') and not back:
        f.rect(6, 13, 9, 15, WHITE)  # shirt under the jacket
        f.rect(7, 14, 8, 18, p['tie']); f.set(7, 13, WHITE); f.set(8, 13, WHITE)
    if p.get('hood') and not back:
        f.rect(5, 12, 10, 13, shade(top, .85)); f.set(6, 15, WHITE); f.set(9, 15, WHITE)
    if arms == 'up':
        f.rect(2, 6, 3, 13, top); f.rect(12, 6, 13, 13, top)
        f.rect(2, 5, 3, 5, p['skin']); f.rect(12, 5, 13, 5, p['skin'])
    else:
        la = 1 if step == 2 else 0  # arm swings with the opposite leg
        ra = 1 if step == 1 else 0
        f.rect(2, 13, 3, 19 + la, top); f.rect(12, 13, 13, 19 + ra, top)
        f.rect(2, 20 + la, 3, 21 + la, p['skin']); f.rect(12, 20 + ra, 13, 21 + ra, p['skin'])


def head_front(f, p, face='plain', back=False):
    skin, hair = p['skin'], p['hair']
    f.rect(4, 4, 11, 11, skin)
    f.rect(7, 12, 8, 12, shade(skin, .85))
    if back:
        f.rect(4, 3, 11, 11, hair)
        if p.get('cap'):
            f.rect(4, 3, 11, 5, p['cap'])
        if p.get('longhair'):
            f.rect(4, 11, 11, 16, hair)
        if p.get('ponytail'):
            f.rect(7, 12, 8, 16, hair)
        if p.get('bald'):
            f.rect(5, 3, 10, 6, shade(skin, .95))
        if p.get('beanie'):
            f.rect(4, 2, 11, 5, p['beanie'])
        if p.get('bun'):
            f.rect(6, 0, 9, 2, hair)
        if p.get('curly'):
            f.rect(3, 2, 12, 9, hair)
        if p.get('hood'):
            f.rect(4, 9, 11, 13, shade(p['top'], .85))
        if p.get('mohawk'):
            f.rect(4, 3, 11, 11, shade(skin, .95)); f.rect(7, 0, 8, 11, hair)
        return
    # hair
    if p.get('bald'):
        f.rect(4, 5, 4, 8, hair); f.rect(11, 5, 11, 8, hair)
    else:
        f.rect(4, 3, 11, 5, hair)
        f.set(4, 6, hair); f.set(11, 6, hair)
    if p.get('spiky'):
        for x in (4, 6, 8, 10):
            f.set(x, 2, hair)
    if p.get('longhair'):
        f.rect(3, 4, 3, 15, hair); f.rect(12, 4, 12, 15, hair)
        f.rect(4, 6, 4, 14, hair); f.rect(11, 6, 11, 14, hair)
    if p.get('ponytail'):
        f.set(12, 5, hair); f.set(12, 6, hair)
    if p.get('cap'):
        f.rect(4, 3, 11, 4, p['cap']); f.rect(3, 5, 12, 5, shade(p['cap'], .8))
    if p.get('beanie'):
        f.rect(4, 2, 11, 5, p['beanie']); f.rect(4, 5, 11, 5, shade(p['beanie'], .8)); f.set(7, 1, p['beanie']); f.set(8, 1, p['beanie'])
    if p.get('bun'):
        f.rect(6, 0, 9, 2, hair)
    if p.get('curly'):
        f.rect(3, 2, 12, 4, hair); f.rect(3, 5, 3, 9, hair); f.rect(12, 5, 12, 9, hair)
        for x in (3, 6, 9, 12):
            f.set(x, 1, hair)
    if p.get('mohawk'):
        f.rect(4, 3, 11, 5, shade(skin, .95)); f.rect(7, 0, 8, 4, hair)
    # face
    ey = 8 if face != 'down' else 9
    if face == 'closed':
        f.set(5, ey, EYE); f.set(6, ey, EYE); f.set(9, ey, EYE); f.set(10, ey, EYE)
    else:
        f.set(6, ey, EYE); f.set(9, ey, EYE)
        f.set(6, ey - 1, EYE); f.set(9, ey - 1, EYE)
    if p.get('glasses'):
        for x in (5, 7, 8, 10):
            f.set(x, ey - 1, (60, 60, 70))
        f.set(5, ey, (60, 60, 70)); f.set(7, ey, (60, 60, 70)); f.set(8, ey, (60, 60, 70)); f.set(10, ey, (60, 60, 70))
    mouth = shade(skin, .6)
    if face == 'happy':
        f.set(6, 10, mouth); f.set(7, 11, mouth); f.set(8, 11, mouth); f.set(9, 10, mouth)
    elif face in ('sad', 'down', 'closed'):
        f.set(6, 11, mouth); f.set(7, 10, mouth); f.set(8, 10, mouth); f.set(9, 11, mouth)
    else:
        f.set(7, 10, mouth); f.set(8, 10, mouth)
    f.set(5, 9, shade(skin, .92)); f.set(10, 9, shade(skin, .92))  # cheeks
    if p.get('beard'):
        f.rect(4, 9, 11, 12, hair); f.rect(5, 13, 10, 13, hair)
        if face == 'happy':
            f.set(6, 10, mouth); f.set(7, 11, mouth); f.set(8, 11, mouth); f.set(9, 10, mouth)
        else:
            f.set(7, 10, mouth); f.set(8, 10, mouth)


def front(p, step=0, face='plain', arms='down', back=False):
    f = Frame()
    legs_front(f, p, step)
    body_front(f, p, arms, step, back)
    head_front(f, p, face, back)
    f.outline()
    return f


def side(p, step=0):
    """Facing right."""
    f = Frame()
    skin, hair, top, bottom, shoes = p['skin'], p['hair'], p['top'], p['bottom'], p['shoes']
    # legs
    if step == 0:
        legs = [(6, 9, 28)]
    elif step == 1:
        legs = [(4, 6, 28), (9, 11, 28)]
    else:
        legs = [(5, 7, 28), (8, 10, 27)]
    if p.get('skirt'):
        f.rect(5, 21, 10, 24, bottom)
        for x0, x1, ly in legs:
            f.rect(x0, 25, min(x1, x0 + 1), ly, skin)
    else:
        for x0, x1, ly in legs:
            if p.get('shorts'):
                f.rect(x0, 22, x1, 24, bottom); f.rect(x0, 25, min(x1, x0 + 1), ly, skin)
            else:
                f.rect(x0, 22, x1, ly, bottom)
    for x0, x1, ly in legs:
        f.rect(x0, ly + 1, x1 + 1, ly + 2, shoes)
    # body
    f.rect(5, 13, 10, 21, top)
    f.rect(9, 13, 10, 21, shade(top, 1.1))
    # arm
    ax = {0: 7, 1: 9, 2: 5}[step]
    f.rect(ax, 14, ax + 1, 19, shade(top, .85))
    f.rect(ax, 20, ax + 1, 21, skin)
    # head
    f.rect(5, 4, 11, 11, skin)
    f.rect(7, 12, 8, 12, shade(skin, .85))
    f.rect(5, 3, 10, 5, hair)
    f.rect(5, 6, 7, 9, hair)
    if p.get('bald'):
        f.rect(6, 3, 10, 5, shade(skin, .95)); f.rect(5, 6, 6, 8, hair)
    if p.get('spiky'):
        for x in (5, 7, 9):
            f.set(x, 2, hair)
        f.set(4, 4, hair)
    if p.get('longhair'):
        f.rect(4, 4, 6, 16, hair)
    if p.get('ponytail'):
        f.rect(3, 6, 4, 13, hair)
    if p.get('cap'):
        f.rect(5, 3, 10, 4, p['cap']); f.rect(9, 5, 13, 5, shade(p['cap'], .8))
    if p.get('beanie'):
        f.rect(5, 2, 11, 5, p['beanie']); f.rect(5, 5, 11, 5, shade(p['beanie'], .8))
    if p.get('bun'):
        f.rect(3, 3, 5, 5, hair)
    if p.get('curly'):
        f.rect(4, 2, 11, 4, hair); f.rect(3, 4, 6, 10, hair)
    if p.get('mohawk'):
        f.rect(5, 3, 10, 6, shade(skin, .95)); f.rect(5, 6, 6, 8, shade(skin, .95)); f.rect(4, 0, 9, 2, hair)
    if p.get('hood'):
        f.rect(4, 10, 6, 13, shade(top, .85))
    if p.get('tie'):
        f.rect(10, 14, 10, 18, p['tie'])
    f.set(9, 7, EYE); f.set(9, 8, EYE)
    if p.get('beard'):
        f.rect(8, 9, 11, 12, hair)
    if p.get('glasses'):
        f.rect(8, 7, 10, 7, (60, 60, 70)); f.set(8, 8, (60, 60, 70)); f.set(10, 8, (60, 60, 70)); f.set(7, 7, (60, 60, 70))
    f.set(11, 9, shade(skin, .9))
    f.set(10, 10, shade(skin, .6))
    f.outline()
    return f


def sheet(p):
    frames = []
    walk = [0, 1, 0, 2]
    frames.append([front(p, s) for s in walk])
    frames.append([front(p, s, back=True) for s in walk])
    right = [side(p, s) for s in walk]
    frames.append([fr.mirrored() for fr in right])
    frames.append(right)
    frames.append([
        front(p, 0, 'happy', 'up'),
        front(p, 0, 'happy', 'up').shifted(-2),
        front(p, 0, 'sad'),
        front(p, 0, 'closed').shifted(1),
    ])
    return frames


def write_png(path, frames):
    w, h = W * COLS, H * ROWS
    rows = []
    for y in range(h):
        row = bytearray([0])
        fr = frames[y // H]
        for x in range(w):
            c = fr[x // W].px[y % H][x % W]
            row += bytes(c if c else (0, 0, 0, 0))
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(t, data):
        return struct.pack('>I', len(data)) + t + data + struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as fh:
        fh.write(png)


if __name__ == '__main__':
    out = os.path.join('images', 'sprites')
    os.makedirs(out, exist_ok=True)
    for i, p in enumerate(CUSTOMERS, 1):
        write_png(os.path.join(out, f'customer-{i}.png'), sheet(p))
    print(f'{len(CUSTOMERS)} sheets in {out}')
