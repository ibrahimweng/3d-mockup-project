#!/usr/bin/env python3
"""Draw the cotton duck the tote bag is made of.

Usage:
    python3 scripts/make-canvas-weave.py

Writes public/textures/canvas-normal.png, which `scripts/prep-tote-bag.mjs`
tiles across the bag from world position. Synthesised rather than photographed,
which is a constraint of where this runs, and stated rather than hidden: what it
is is a real tiling normal map built from a height field, seamless by
construction because every term in that field is periodic.

The tote's own file ships no normal map -- unlike the shirt, where there is an
authored weave to restore -- so without this the canvas renders as a flat sheet.

Needs Pillow.
"""

import math
import os.path
import sys

from PIL import Image

OUT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "textures", "canvas-normal.png")
)

SIZE = 512
# Thread crossings across one tile. `prep-tote-bag.mjs` lays 10.4 tiles down per
# world unit, which works out at roughly 1.2 threads to the millimetre on a bag
# this size -- the coarse end of canvas, which is what a tote is.
THREADS = 8
STRENGTH = 2.2


def height(x, y):
    tu, tv = (x + 0.5) / SIZE * THREADS, (y + 0.5) / SIZE * THREADS
    iu, iv = int(tu) % THREADS, int(tv) % THREADS
    fu, fv = tu - math.floor(tu), tv - math.floor(tv)
    # Which thread is on top at this crossing. A real plain weave alternates at
    # every crossing, so the parity of the two indices decides it.
    over = (iu + iv) % 2 == 0
    # A thread is round, so its height across its own width is a half sine. The
    # one passing underneath still lifts the cloth a little, which keeps the
    # weave from reading as a grid of separate cords.
    warp = math.sin(math.pi * fu) * (1.0 if over else 0.45)
    weft = math.sin(math.pi * fv) * (0.45 if over else 1.0)
    # A little variation so the cloth is not mechanically perfect; periodic, so
    # the tile still meets itself.
    u, v = (x + 0.5) / SIZE, (y + 0.5) / SIZE
    return max(warp, weft) + 0.05 * math.sin(2 * math.pi * u * 7) * math.cos(2 * math.pi * v * 5)


def main():
    field = [[height(x, y) for x in range(SIZE)] for y in range(SIZE)]
    scale = STRENGTH * THREADS / 2.0
    pixels = []
    for y in range(SIZE):
        for x in range(SIZE):
            gx = (field[y][(x + 1) % SIZE] - field[y][(x - 1) % SIZE]) * 0.5
            gy = (field[(y + 1) % SIZE][x] - field[(y - 1) % SIZE][x]) * 0.5
            nx, ny, nz = -gx * scale, -gy * scale, 1.0
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            pixels.append(tuple(round((c / length) * 0.5 * 255 + 127.5) for c in (nx, ny, nz)))
    img = Image.new("RGB", (SIZE, SIZE))
    img.putdata(pixels)
    img.save(OUT)
    print(f"  canvas-normal.png  {SIZE}x{SIZE}, {THREADS} threads")
    return 0


if __name__ == "__main__":
    sys.exit(main())
