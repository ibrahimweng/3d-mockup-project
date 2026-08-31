#!/usr/bin/env python3
"""Draw the placeholder artwork every print zone ships with.

Usage:
    python3 scripts/make-print-templates.py

Writes every file in TEMPLATES into public/templates. These are two things at
once: the image a product starts with in the viewer, and the file a user
downloads to design against. So the pixel size of each one is its zone's
measured aspect ratio at 2048 on the long side -- a design drawn on a template
whose proportions differ from the zone it lands on arrives stretched.

The sizes here come from the spans the prep scripts print. When an unwrap
changes, the row changes with it, and `scripts/build-template-archives.mjs`
repacks the downloads.

Needs Pillow.
"""

import os.path
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "templates")

INK = (38, 40, 44)
FAINT = (216, 218, 222)
MID = (148, 152, 158)
PAPER = (247, 246, 243)
SEAM = (196, 72, 58)
# The safe-area box and the centre cross, a shade above the grid and well below
# the ink. At MID they read as a scratch on the cloth once the panel curves away
# and the line foreshortens into a thick dark band, which is exactly where a
# mockup gets looked at. They are guides, not marks.
GUIDE = (198, 201, 206)

# name, width, height, title, what the zone is, sheet kind.
#
# The pixel size is the print area's own aspect ratio, and the note is its size
# in millimetres, because a print area is a physical thing: a whole panel of a
# sublimated bag or tee, the whole face on the card, the full wrap on a bottle
# or a sleeve. None of the cloth panels is a flat rectangle -- a tote narrows
# toward its mouth, a shirt panel has a neck curve and two armholes cut out of
# it -- so the millimetres are the box the panel occupies once it is flattened,
# which is the shape the design is scaled to and the shape a real pattern piece
# would be cut from.
#
# "flat" is a panel: a rectangle of cloth or card with four free edges. "wrap"
# is a cylinder cut open, so its left and right edges are the same edge, and it
# says so -- a seam bar down both sides, the quarter turns marked across the
# top, and a note that artwork crossing the join has to line up.
TEMPLATES = [
    ("id-card-front", 1291, 2048, "ID CARD  ·  FRONT", "full bleed, prints around the punch hole", "flat"),
    ("id-card-back", 1291, 2048, "ID CARD  ·  BACK", "full bleed, prints around the punch hole", "flat"),
    ("tote-bag-front", 1745, 2048, "TOTE BAG  ·  FRONT", "319 x 375 mm, flattened panel, fold to fold", "flat"),
    ("tote-bag-back", 1725, 2048, "TOTE BAG  ·  BACK", "320 x 379 mm, flattened panel, fold to fold", "flat"),
    ("tote-bag-left", 860, 2048, "TOTE  ·  LEFT GUSSET", "158 x 375 mm, flattened panel, fold to fold", "flat"),
    ("tote-bag-right", 859, 2048, "TOTE  ·  RIGHT GUSSET", "158 x 376 mm, flattened panel, fold to fold", "flat"),
    ("tshirt-front", 1742, 2048, "T-SHIRT  ·  FRONT", "528 x 622 mm, flattened panel, seam to seam", "flat"),
    ("tshirt-back", 1683, 2048, "T-SHIRT  ·  BACK", "521 x 634 mm, flattened panel, seam to seam", "flat"),
    ("tshirt-sleeve-left", 2048, 1586, "T-SHIRT  ·  LEFT SLEEVE", "427 x 331 mm, flattened panel  ·  cuff at the top  ·  underarm seam at the sides", "flat"),
    ("tshirt-sleeve-right", 2048, 1577, "T-SHIRT  ·  RIGHT SLEEVE", "426 x 328 mm, flattened panel  ·  cuff at the top  ·  underarm seam at the sides", "flat"),
    ("water-bottle-body", 2048, 1490, "WATER BOTTLE  ·  BODY WRAP", "137 mm around  ·  100 mm foot to neck  ·  seam at the back", "wrap"),
]


def font(size):
    for path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def draw(width, height, title, note, kind):
    img = Image.new("RGB", (width, height), PAPER)
    d = ImageDraw.Draw(img)

    step = max(width, height) // 16
    for x in range(step, width, step):
        d.line([x, 0, x, height], fill=FAINT, width=2)
    for y in range(step, height, step):
        d.line([0, y, width, y], fill=FAINT, width=2)

    d.line([width // 2, 0, width // 2, height], fill=GUIDE, width=3)
    d.line([0, height // 2, width, height // 2], fill=GUIDE, width=3)
    margin = int(min(width, height) * 0.07)
    d.rectangle([margin, margin, width - margin, height - margin], outline=GUIDE, width=3)

    cx, cy = width // 2, height // 2 + int(height * 0.04)
    r = int(min(width, height) * 0.16)
    stroke = max(4, r // 18)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=INK, width=stroke)
    d.polygon(
        [(cx, cy - int(r * 0.52)), (cx + int(r * 0.48), cy + int(r * 0.34)), (cx - int(r * 0.48), cy + int(r * 0.34))],
        outline=INK, width=stroke,
    )
    d.ellipse([cx - r // 7, cy - r // 7, cx + r // 7, cy + r // 7], fill=INK)

    size = max(18, int(min(width, height) * 0.045))
    d.text((cx - int(size * 3.1), cy + r + int(size * 0.4)), "PLACEHOLDER", font=font(size), fill=INK)
    d.text((margin + int(size * 0.4), margin + int(size * 0.4)), title, font=font(int(size * 1.15)), fill=INK)
    subtitle = f"{width} x {height} px  ·  {width / height:.2f} : 1  ·  {note}"
    left = margin + int(size * 0.4)
    # A wide sheet with a long note runs the subtitle off the edge, so it gives
    # up size rather than the end of the sentence.
    small = font(int(size * 0.72))
    room = width - margin - left
    while d.textlength(subtitle, font=small) > room and small.size > 12:
        small = font(small.size - 2)
    d.text((left, margin + int(size * 1.9)), subtitle, font=small, fill=MID)
    if kind == "wrap":
        mark_the_seam(d, width, height, margin, size)
    return img


def mark_the_seam(d, width, height, margin, size):
    """Say where the two edges of a wrap meet, and which way round it goes.

    A flat panel's edges are edges. A wrap's left and right edges are the same
    line on the product, so a design that runs off one side has to arrive back
    on the other, and a quarter turn has to be findable -- otherwise the only
    way to know where the front is is to print it and look.
    """
    bar = max(4, width // 220)
    d.rectangle([0, 0, bar, height], fill=SEAM)
    d.rectangle([width - bar - 1, 0, width, height], fill=SEAM)

    turns = ((0.0, "BACK / SEAM"), (0.25, "LEFT"), (0.5, "FRONT"), (0.75, "RIGHT"))
    labels = [f"{face}  u={turn:.2f}" for turn, face in turns]
    gap = int(size * 0.3)
    # One size for the row, chosen so the widest quarter still fits its quarter.
    small = font(int(size * 0.62))
    while small.size > 10 and max(
        d.textlength(label, font=small) for label in labels
    ) > width / len(turns) - gap * 2:
        small = font(small.size - 2)
    for (turn, _), label in zip(turns, labels):
        x = int(width * turn)
        if turn > 0:
            d.line([x, 0, x, height], fill=GUIDE, width=3)
        d.text((x + bar + gap, int(size * 0.25)), label, font=small, fill=SEAM)

    note = "Left and right edges join. Keep artwork inside the inner rule."
    d.text((margin + int(size * 0.4), height - margin - int(size * 1.2)), note, font=small, fill=MID)


def main():
    for name, width, height, title, note, kind in TEMPLATES:
        path = os.path.normpath(os.path.join(OUT, f"{name}.png"))
        draw(width, height, title, note, kind).save(path)
        print(f"  {name:24} {width} x {height}  {kind}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
