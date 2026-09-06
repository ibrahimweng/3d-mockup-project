# Surface and material maps

Every file in this folder is made by this repository. None of it is
photographed, downloaded or bought.

Three scripts write all 21 of them, from a periodic noise lattice rather than
from a scan:

| Script | What it writes |
| --- | --- |
| `scripts/make-surface-textures.mjs` | the tabletop maps: oak, stone, steel, paper |
| `scripts/make-material-textures.mjs` | the product-part maps: nickel, plastic, hardboard |
| `scripts/make-canvas-weave.py` | the tote's woven canvas normal map |

Each surface has an albedo, a normal and a roughness map, and each set is built
from one height field so the three agree about where the surface is high and
low. They all tile, because a seam running across a tabletop is the flaw that
reads instantly as computer graphics.

`scripts/make-surface-textures.mjs` says in its own header why they are
synthesised: every texture library is unreachable from where it runs. Swapping
in a real scan later means replacing files here and nothing else.

## Licence

These are outputs of this repository's own scripts, so they are covered by the
MIT licence in `LICENSE.md` along with the rest of the code.
