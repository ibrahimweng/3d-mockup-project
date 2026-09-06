# The nine product models

**This file has gaps, and they are marked. Nobody should assume the models here
are safe to redistribute until the blanks below are filled in.**

## What is in this folder

Nine GLB files, 56MB in total, served straight from `/models/` where anyone can
download them.

| File | Product | How it got here |
| --- | --- | --- |
| `iphone-5.glb` | iPhone 17 Pro Max | Not recorded |
| `macbook.glb` | MacBook, iMac | Not recorded |
| `mac-studio.glb` | Mac Studio | Not recorded. Shipped as supplied, Draco and all |
| `apple-watch-ultra.glb` | Apple Watch Ultra | Not recorded |
| `tshirt.glb` | T-Shirt | Built by `scripts/prep-tshirt.mjs` from a bought `tshirt.glb` |
| `tote-bag.glb` | Tote Bag | Built by `scripts/prep-tote-bag.mjs` from a bought `tote-bag.obj` |
| `water-bottle.glb` | Water Bottle | Built by `scripts/prep-water-bottle.mjs` from a bought `water-bottle.glb` |
| `id-card.glb` | ID Card | Built by `scripts/prep-id-card.mjs` from a bought `id-card.glb` |
| `tablet-folder.glb` | Clipboard | Built by `scripts/prep-tablet-folder.mjs` from a bought `tablet-folder.glb` |

`docs/merchandise-models.md` describes how the five merchandise models are
rebuilt from their sources, and says the sources are licensed assets kept out of
git in `assets/model-sources/`.

## What is not recorded, and needs to be

Nothing in this repository says where any of these came from. For each of the
nine files, three things are missing:

1. **The seller and the product page.** Which marketplace or artist, and the
   link to the exact item.
2. **The licence it was sold under.** The name of the licence, and a copy or a
   link to its terms.
3. **Whether that licence allows what this project does with it.** That is the
   one that decides everything below.

## Why the third question is the important one

The `.gitignore` file calls the source models "Bought source models: licensed
assets, not redistributable". The files in this folder are derived from those
sources, and they are committed to a public repository and served as downloads.
A visitor can fetch `/models/tshirt.glb` and open it in Blender.

Most commercial 3D model licences allow a model to be used inside a rendered
image and forbid redistributing the geometry itself in a form somebody can
extract. If that is what these licences say, then serving the GLB files
directly is not allowed, whatever was done to the geometry first.

There is a second question underneath it. `LICENSE.md` is an MIT licence, and
MIT grants everyone the right to copy, modify and sell everything in the
repository. If these models cannot be relicensed that way, then that grant is
being made over something this project does not own.

## The trademark question, separately

Five of the nine are Apple product designs, named in the interface with Apple
trademarks: iPhone 17 Pro Max, MacBook, iMac, Mac Studio and Apple Watch Ultra.
That is a separate decision from the licensing above and it should be a decision
rather than an oversight.

## What to do about it

Fill in the table. If a licence turns out to forbid redistribution, the options
are to replace that model with one whose licence allows it, to buy the extended
licence that does, or to stop serving the file and render from something else.

Until then, treat everything in this folder as **not covered by the repository's
MIT licence**. The MIT licence in `LICENSE.md` covers the code.
