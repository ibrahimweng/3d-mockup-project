# Merchandise model quality spec

The five merchandise models (ID card, tote bag, T-shirt, water bottle, tablet
folder) are prepped from bought geometry by scripts, not modelled here. This
file is the standing definition of what "correct" means for them: what each
part physically is, which invariants hold, and how a change is proved before it
ships.

It exists because the models have been fixed one visible symptom at a time, and
each fix introduced the next symptom. The point of the spec is to stop that.

## 1. The failure pattern

Every structural defect currently in the files came from the same mistake:
**assigning a material to a triangle by testing a coordinate against a magic
number.**

| Prep script | The threshold | What it broke |
| --- | --- | --- |
| `prep-id-card` | `centroid.y > 1.73` is the clip | 176 clasp triangles wear card materials, 48 of them the printed artwork |
| `prep-id-card` (earlier) | atlas `v > 0.66` is the clip | the card's top band rendered as brushed metal |
| `prep-tote-bag` | `centroid.y > 6.51` is a handle | 161 handle triangles wear the front and back print |

A threshold is a guess about where a part ends. The model already knows where
its parts end: they are **separate connected components**. The clasp is not
"the bits above y=1.73", it is a mesh island that shares no vertex with the
card. Splitting on the island needs no number and cannot half-cut a part.

**Rule: classify by shell first, by face direction second.** A coordinate
threshold may only ever subdivide *within* one shell, never separate two parts.

## 2. What each model is

The physical description each model is held to. This is the "how it should
look" decision, and the tests below are its machine-checkable half.

### ID card

A printed PVC card hanging from a metal swivel clasp.

| Part | Shells | Material | Prints? | Surface |
| --- | --- | --- | --- | --- |
| Card face, front | slab, +Z faces | `Card_Front` | yes, full bleed | matte PVC, metallic 0, roughness 0.42 |
| Card face, back | slab, −Z faces | `Card_Back` | yes, full bleed | as above |
| Card rim | slab, side faces | `Card_Edge` | no, colour slot | as above |
| Swivel clasp | 6 separate islands | `Clip` | **never** | nickel, metallic 1, roughness 0.28 |

The card is a closed solid — zero boundary edges — and stays that way. The
print runs to the physical edge of the card (full bleed); the rim is the only
unprinted part of the slab. Nothing on the clasp is ever painted, tinted or
textured by an artwork zone: it is hardware.

### Tote bag

A heavyweight cotton canvas tote with webbing handles: 380mm wide, 374mm tall,
a 155mm gusset, 612mm to the top of the straps.

| Part | Shells | Material | Prints? | Surface |
| --- | --- | --- | --- | --- |
| Front, back, left, right panels | body, by how far round the bag a face sits | `Bag_Front`/`Bag_Back`/`Bag_Left`/`Bag_Right` | yes, edge to edge | canvas: metallic 0, roughness 0.78, tiled weave normal map |
| Base | body, −Y faces | `Bag_Base` | no, colour slot | as above |
| Lining, and the crown of the mouth | body, faces looking inward, plus the couple of millimetres where the cloth turns over the rim | `Bag_Lining` | no | as above |
| Handles | 2 separate islands | `Bag_Handles` | **never** | webbing, same finish |

The bag is sewn cloth and it is **closed**: zero boundary edges anywhere, an
inside as well as an outside, and two handles that are solid straps rather than
ribbons. That comes from the source rather than from repair — the earlier
source was a flat panel with no volume, and inflating it, hemming its mouth and
rounding its folds were three passes of prep spent putting back what a bag
already has. Splitting the outer cloth from the lining is what keeps a print
area on the outside of the panel: the lining sits directly behind it and inside
the same rectangle.

Each side prints **its whole panel, fold to fold and base to mouth** — 301 by
372mm front and back, 147 by 370mm on each gusset — the way a sublimated bag is
printed rather than a screen-printed one. Ink runs into the corner folds and
under the handle stitching; it stops only at the crown of the mouth, where the
cloth turns over the rim, which is where a printed panel stops on a real bag
too.

A plane cannot hold a fold, and every side here runs round two, so the unwrap
does not use one. The bag is sliced into horizontal rings, each ring is walked
round to give distance travelled, and a point sits where it falls along its own
ring: across a side is how far between that side's two folds, up it is height.
A fold then costs the design exactly the cloth it takes up. Projected onto the
plane a gusset faces, the typical face carried 1.42 times less ink per square
millimetre than the flat middle of the same panel, and no rectangle in that
plane covered more than 0.92 of it; measured round the rings, 1.12 and 0.996.

Ring by ring rather than one outline for the whole bag, because a tote is not a
prism: this one is 152mm deep at its base and 118mm at its mouth. The seams sit
at a fixed fraction of the way round at every height, which is what sewing four
panels together does, and it is what stops the taper landing entirely on the
gussets — split instead by the bag's own corner diagonal they carry 150mm of
cloth at the base and 107mm at the mouth, and a design filling that is squeezed
by two fifths on the way up.

The millimetres above are each panel's average width over its height, which is
what a design is scaled to. The panels narrow toward the mouth with the bag, so
a design closes up by an eighth on the way up, which is what happens to a real
all-over print on a bag that tapers.

### T-shirt

A heavyweight cotton tee, photographed close up.

| Part | Material | Prints? | Surface |
| --- | --- | --- | --- |
| Front, back panels | `Shirt_Front`, `Shirt_Back` | yes, seam to seam | jersey: metallic 0, roughness 0.86, weave normal map on TEXCOORD_1 |
| Sleeves | `Shirt_Sleeve_Left`, `Shirt_Sleeve_Right` | yes, round the arm from the cuff to the shoulder | as above |
| Hem, the last 8mm of each cuff, and the woven neck label | `Shirt_Body` | no, follows the print background | as above |
| Collar rib and hem facings | `Rib_1X1_486gsm_116764` | no, accent colour slot | cotton at roughness 0.9, a shade duller than the body |
| Placket trim | `Shirt_Front_Trim` | no, follows the print background | as above |

A tee is one bolt of jersey with a rib collar sewn to it, so the collar is the
only part of it with a colour of its own. Everything the four prints do not
reach is the same cloth as the panels and takes the same print background,
declared as `blankStockMaterials` in the catalog: the hem band, the cuffs, the
head of each sleeve, the facings turned under. On colour slots of their own
they were a second opinion about what the garment was made of — colouring the
shirt in Parts turned the hem and the cuffs that colour and
left every printed panel on the background, which is a contrast-yoke ringer tee
arrived at by accident. A zone with nothing uploaded shows its template over
that same cloth rather than over white, so the empty garment is one colour too.

The modeller cut this garment into pieces and each panel is its own primitive,
so a panel's boundary is the seam it is sewn on rather than anything guessed.
Hem, cuffs and neck are turned under — 20mm on the body and the cuffs, 10mm at
the neck, each rim reading at twice its cloth. The shirt is shot close up, and a
paper-thin rim is exactly what gives that away. Every panel renders both faces so the
cloth is never see-through from an angle.

Each panel prints **to its seams** — 458 by 586mm on the front, 448 by 604mm on
the back, 407mm round each sleeve by 307mm from the cuff to the shoulder. Ink
stops at the hem, the last 8mm of each cuff and the collar rib, which is where
a tee is folded and where the fold has to be built out of cloth the print does
not own.

A plane cannot hold a panel that wraps round a body: projected onto one, the
cloth past the turn prints back to front — 156 triangles on the front, 411 on
the back and about 670 on each sleeve, which is why this used to be a 240 by
320mm platen. So the design follows the cloth. The shirt is sliced into rings,
each ring is walked round to give distance travelled, and a point sits where it
falls along its own ring: across the body for the panels, across each sleeve's
own axis for the sleeves. Six triangles of the whole garment still read the
wrong way round, all of them cloth folded into a seam.

A sleeve's axis is found armhole-to-cuff, not by where the sleeve is most spread
— a flared sleeve is spread across as much as along, and that axis is six
degrees steeper, which walks it out through the cloth. Taking the axis from the
two boundary loops instead lands within three degrees of the same answer.

The head of a sleeve is the part that is not a tube: the armhole is cut along a
curve running a third of the way back down the axis, so a slice through it
meets the cloth on some sides and not others. It used to be left plain for want
of anything to measure a way round from — a third of each arm in flat colour,
which on a printed garment reads as a contrast raglan yoke. It prints now. A
head slice is closed by borrowing the shape of a whole ring further down the
sleeve and sizing it to the cloth that is actually there. Two things that do not
work, both measured: carrying the last radius forward across the gap draws a
straight edge where the cloth curves, and joining the two lips of the gap closes
a head slice into a circle 237mm around where the cuff is 430 — and a fraction
of 237 is nearly twice the design per millimetre that a fraction of 430 is.

A shirt panel is not a rectangle. A body panel has a neck curve and two armholes
cut out of it and fills its own bounding box 0.875 to 0.879; a whole sleeve laid
flat is a bell and fills 0.579 to 0.590. The corners of a rectangular design
land where the cloth is not — which is what printing a rectangle on a cut panel
does, and why each panel's template draws its outline. `CUT_PANELS` in the
baselines gives each of them its own figure; every other zone is a rectangle and
stays at 0.95.

### Water bottle

A powder-coated steel bottle with a screw cap and a swing latch.

| Part | Material | Prints? | Surface |
| --- | --- | --- | --- |
| Body, outside | `Bottle_Body` | yes, one continuous wrap, seam at the back | coated steel |
| Foot disc and top annulus | `Bottle_Body_Ends` | no | as above |
| Cap, ring, latch | `Bottle_Head_Cap`/`_Ring`/`_Latch` | no, colour slots | as above |

The wrap covers every face of the body that looks away from the axis — the base
roll, the wall, the shoulder and the neck, up to the height where the chrome
ring takes over, which is exactly where the body ends. Only the two discs
facing along the axis are left out, because a cylindrical wrap has nowhere to
put them. Its second coordinate is distance along the profile rather than
height: the shoulder loses 5mm of radius over 8mm of height, so it is longer
than it is tall, and by height alone its share of the label arrives squeezed
into a band. Measured at the widest ring the wrap is 1.37 to 1.

### Tablet folder

A folio with a pen loop and a clasp pin, holding a pad of paper.

The file paints all five of its meshes with one material at metallic 1 and
roughness 1, which renders it black, and hangs a photograph of somebody's
document off it. Phase 4 prepped it like the rest, so the file now names its
own parts -- `Folder_Board`, `Folder_Pen`, `Folder_Clip`, `Folder_Sheet` and
`Folder_Pad`, which is the only one that prints -- instead of the catalog
correcting them on the way to the screen.

## 3. The test schema

Invariants over the shipped GLBs, read straight out of the files. Each has an
id, a rule, and the reading it had **when the schema was written**, which is
what the phases below were planned against; `—` means it already held then.
Those readings are a record of the defect, not a current status. What the files
measure now lives in
[`src/app/model-quality.baselines.ts`](../src/app/model-quality.baselines.ts),
which the test suite asserts exactly, so a number there is never out of date by
more than the commit that moved it.

### A. Part integrity — a part is one material

| id | Invariant | When the schema was written |
| --- | --- | --- |
| A1 | No shell carries both a hardware material and a print material. Hardware is declared per product (`Clip`, `Bag_Handles`). | **card: 1 shell fails. tote: 2 shells fail.** |
| A2 | Every triangle of a hardware shell wears the hardware material — no exceptions, no share threshold. | **card: 176 tris. tote: 161 tris.** |
| A3 | Every material name in the file is claimed by the catalog as a zone, a colour part, or a declared fixed material. | **not tested, and not true: shirt 1, bottle 1, folder 2.** |

A1 and A2 are the user-visible "the texture overlaps the metal" defect. They
are absolute: not "mostly", not "under 5%". Zero.

A3 read `—` here for four phases and had no test behind it. It was not true.
Four materials were named by nothing: the shirt's woven neck label, still
wearing the source's own texture at a roughness no other cloth on the garment
uses; the bottle's two end discs; and the folder's pad edge and loose sheets. A
material nobody names is a part nobody can reach -- no design lands on it and
no colourway paints it, so it holds whatever the source baked in while
everything around it changes. The label went into the body cloth, the other
three are declared `fixedMaterials`, and the test now exists.

### B. Print fidelity — the image lands where it was drawn

| id | Invariant | When the schema was written |
| --- | --- | --- |
| B1 | A print zone's unwrap covers ≥ 0.95 of its 0–1 square, or, for a zone that is a panel the garment was cut from rather than a rectangle, as much of it as the panel's own silhouette fills its bounding box. Below that, part of the template the user is handed never reaches the product. | — all of them: card 0.987 · tote 1.00 · shirt 0.875–0.879 on the body and 0.579–0.590 on the sleeves, each held to its own figure in `CUT_PANELS` · bottle 1.00 · folder 0.998 |
| B2 | Stretch ≤ 1.25 — the ink per square millimetre in the tightest one per cent of a zone, against the middle of it, so a design lands at an even density. | ✗ the sleeves, at 1.67. Everything else: card 1.00 · tote ≤ 1.17 · shirt body ≤ 1.26 · bottle 1.20 · folder 1.00. The sleeves fail it knowingly: printing the head as well as the tube costs 1.6 to 1.8 times the density on the tongue of cloth at the shoulder point, about 7 of the sleeve's 730 square centimetres, and the alternative measured was a 48mm bare band there |
| B3 | Zero mirrored triangles within a zone: every triangle in a zone has the same UV handedness, or the artwork folds back on itself. | card 0, tote 0 — · **shirt 156/411/678/667** |
| B4 | A zone's triangles form one connected atlas island, so text is never cut across a gap. | — all of them |
| B5 | Each template PNG's aspect ratio matches its print area's measured aspect within 2%. | — regenerated with the areas |

### C. Surface quality — no artifacts, smooth seams

The models divide "seam" into two different faults, and they need different
fixes:

- a **shading seam** is a line where the stored normals jump across an edge
  the geometry says is flat. It is a texture-space fault.
- a **geometric crease** is an edge where the two faces genuinely meet at a
  hard angle. Smoothing the normals will not hide it; the geometry needs a
  radius.

| id | Invariant | When the schema was written |
| --- | --- | --- |
| C1 | Zero degenerate triangles. | — all five |
| C2 | Zero coincident faces, within or across materials (they z-fight). | — all five |
| C3 | Zero non-manifold edges. | — all five |
| C4 | Open boundary edges match the count the product declares, so a new hole is caught. Today: card 0 (closed), tote 296, shirt 592, bottle 112, folder 124. Hemming does not close a rim — it moves the raw edge inside where it is stitched down and never seen; closing it would mean giving the whole shell a thickness, which the tote and shirt deliberately do not have. | — pins current state |
| C5 | Zero shading-normal splits on an edge the geometry says is flat (< 10° between face normals). | — all five |
| C6 | On soft goods, the count of interior edges at 45° or more is pinned and accounted for. Cloth does not hold a knife edge, but a seam creases, a hem folds right over, and a webbing strap has an edge. Hard-surface products are excluded, not given a larger allowance: a clasp is supposed to have corners. | — pins current state: tote 99 (74 hem fold, 25 handles, 0 on the canvas) · shirt 718 (363 seams, 334 hem fold, 20 open cloth) |

C6 was written to answer "the tote has very sharp edges", and measuring it is
what showed the answer had two halves. The sharpness was geometry — the shading
was already continuous, which is why softening normals never fixed it — and the
rounding in phase 1 took the tote's canvas panels to zero hard edges. But the
same measurement counts every seam, every strap edge and every hem fold, which
are all things sewn goods have. So the count is pinned and explained rather than
driven to zero, and the shading is what the models are held to.

### A note on how these are measured

Positions are welded before any of this is asked, because prep splits vertices
along every texture seam and two faces that meet in space hold different
indices for the same corner. The weld is **a hundred-thousandth of each model's
own diagonal**, never a fixed distance: these files disagree about units by
three orders of magnitude — the water bottle is 0.13 across and the tablet
folder is 38 — so one absolute tolerance is far too loose for one and far too
tight for the other.

This matters because an earlier probe used a fixed tolerance and reported 404
non-manifold edges and 1,759 coincident faces on the water bottle. At that
tolerance it was fusing vertices a thousandth of the whole bottle apart, and
inventing the defects it then reported. The bottle has neither. Both numbers
were the measurement's, not the file's.

Every invariant above now either meets its target or is a pinned count with its
make-up written down. The four phases are finished.

### D. Appearance — physically sane materials

| id | Invariant | When the schema was written |
| --- | --- | --- |
| D1 | Every material a product names is `doubleSided`. | — all five |
| D2 | Fabric keeps its authored weave normal map. | — tote, shirt |
| D3 | No material is both fully metallic and fully rough. Metal shows what it reflects rather than a colour of its own, and a fully rough surface reflects nothing coherent, so such a material has neither diffuse nor highlight left and renders near black whatever base colour it names. | — all five |

## 4. Building them

The shipped GLBs are outputs. Every one is rebuilt from a bought source by a
script in `scripts/`, and rebuilding is how a change to a model is made -- the
files in `public/models` are never edited by hand.

```
python3 scripts/make-canvas-weave.py      # public/textures/canvas-normal.png
python3 scripts/make-print-templates.py   # public/templates/*.png
node scripts/prep-id-card.mjs
node scripts/prep-tote-bag.mjs
node scripts/prep-tshirt.mjs
node scripts/prep-water-bottle.mjs
node scripts/prep-tablet-folder.mjs
node scripts/build-template-archives.mjs id-card-templates.zip \
    id-card-front.png id-card-back.png
node scripts/build-template-archives.mjs tote-bag-templates.zip \
    tote-bag-front.png tote-bag-back.png tote-bag-left.png tote-bag-right.png
node scripts/build-template-archives.mjs tshirt-templates.zip \
    tshirt-front.png tshirt-back.png tshirt-sleeve-left.png tshirt-sleeve-right.png
```

The order matters: a prep script embeds its zone's template as that zone's
starting image, so templates are drawn first. The archives are packed last, and
`app-delivery-schema.test.ts` opens each one and compares it byte for byte
against the PNGs beside it, so a template regenerated without repacking fails.

`prep-model-zones.mjs` is the engine -- it splits one material's triangles into
named zones and gives each its own unwrap -- and `prep-model-geometry.mjs`
answers the two questions it needs about the mesh: which connected component
each face belongs to, and which edges are folds worth rounding.
`prep-model-obj.mjs` reads the one source that is an OBJ, which carries no
scale, no orientation and no scene, and puts it where the product expects it.
Every product has a prep script; the tablet folder got one in phase 4, which is
what stopped the catalog having to correct its parts on the way to the screen.

### The source models

The five sources are licensed assets and are **not committed**. Put them in
`assets/model-sources/` (git-ignored), or point `MODEL_SOURCES` at wherever
they live, under these names:

| Name the scripts ask for | What it is |
| --- | --- |
| `id-card.glb` | the badge and its swivel clasp |
| `tote-bag.obj` | the canvas tote, closed and 301,100 triangles |
| `tshirt.glb` | the stitched tee, 22MB and 611,900 triangles |
| `water-bottle.glb` | the steel bottle |
| `tablet-folder.glb` | the folio |

Without them the scripts stop and say which file is missing. `prep-tshirt.mjs`
also builds one intermediate into `build/`, stripping 590,408 triangles of
topstitch from the source before it splits anything.

## 5. The plan

### How the schema is enforced

A schema that ships red cannot merge, and one that only asserts what already
passes cannot catch a regression. So every invariant is a **ratchet**: it is
declared with the value measured today and the value it must eventually reach,
and it fails the moment a number moves the wrong way.

```
B1  tote front coverage     today 0.773   target ≥ 0.95
```

The suite is green from phase 0 onward. A fix that improves one number and
quietly worsens another is a failure the same day it lands, not a surprise
three phases later. Each phase tightens its own baselines to the target and
leaves the rest alone; a baseline is only ever allowed to move toward the
target, never away from it.

### Phases

Each phase is its own branch, reviewed with before/after renders at the same
camera, and merged before the next one starts.

**Phase 0 — the schema. Done.** The measurement library and the invariants,
every one pinned to its measured number. Nothing about the models changed. This
is the agreed definition of the defect.

**Phase 1 — part integrity (A). Done.** Threshold classification replaced with
shell-first classification in `prep-id-card.mjs` and `prep-tote-bag.mjs`: the
mesh is split into connected components and only the single body component is
subdivided by face direction. `CLASP_Y` and `HANDLE_Y` are gone. Stray triangles
on hardware went from 176 and 161 to zero, and both card faces and the tote's
front and back now unwrap as one island where each arrived in three.

**Phase 2 — print fidelity (B).** Re-unwrap to the printable areas decided
above: full bleed on the card and on each tote side, a flat patch on each
sleeve, the existing wrap on the bottle. Each zone reaches
≥ 0.95 coverage, ≤ 1.25 stretch and zero mirrored triangles. Templates are
regenerated from the new unwraps, so the download matches what prints.

**Phase 3 — surface quality (C). Done.** Five rims are turned under: the tote's
mouth at 25mm, the shirt's hem and both cuffs at 20mm, and its neck at 10mm.
Each reads at twice its cloth, because a hem is the cloth folded back on itself.
The card's 38 shading splits are gone — its normals are recomputed with a
40-degree crease, which leaves the right angle where the rim meets the face
untouched, and the hard-edge count is unchanged at 1,434 to prove it.

Measuring the hard edges changed what the invariant should say. Almost none of
them were the defect: on the shirt 310 run down the side seams and 53 round the
armholes, which is what a sewn seam is, and on the tote every one belongs to a
webbing handle whose edges are pinned on purpose. Its canvas panels hold none at
all — the rounding in phase 1 did that. Only twenty sat in open cloth. Hemming
then added one per rim corner, because a fold is a hard edge. So C6 is pinned
rather than driven to zero, and what the models are actually held to is the
shading, which is clean: no line is drawn across flat cloth on either.

**Phase 4 — appearance (D).** Give the tablet folder a material that is not
metallic 1 at roughness 1, and re-unwrap its print zone: the zone is the stack
of paper, ten triangles filling 0.23 of the atlas in its lower-left corner, so
three quarters of the template a user downloads lands nowhere.

### After the phases

The phase entries above are a log of what was done at the time. Where this
section contradicts one, this section is the current state.

**The bottle's white bands.** Phase 4 fitted the label to the largest run of
near-vertical surface, which threw away the base roll, the shoulder and the
neck along with the two discs a wrap cannot hold -- so the bottle wore a white
band under the chrome ring and another round its foot, 8.5% of the body's
height with no artwork on it. The label is now every face that looks away from
the axis, and its second coordinate is distance along the profile. Stretch
reads 1.2 where it read 1: one turn is 137mm of surface at the wall and 107mm
at the neck, so the artwork closes up over the shoulder the way a real
full-wrap print does. Still inside the 1.25 a zone has to hold.

**A new tote.** The bag was replaced with a source that was modelled as a bag:
closed, consistently wound, with the handles built as solid straps. Free edges
went from 296 to none and 4,036mm of hairline gap along the corners and the
base went with them; the handles are real webbing instead of a ribbon two
triangles wide that stretched wherever it turned. The inflate, hem and round
passes are gone from its prep, and 8,292 triangles became 73,000 -- a fifth of
the source, which is what holds the slack in the cloth.

Two engine changes came out of it. `prep-model-obj.mjs` reads an OBJ into the
pipeline, and `weldFaces` runs after every cut and fuses vertices closer
together than the weld. A cut through a dense mesh leaves near-duplicates that
no two checks agree about, and merging them -- rather than dropping them, which
opens holes -- took the tote from 32 edges used by four faces to none, and took
the shirt's two long-standing ones with it.

### Decisions on record

| Question | Decision |
| --- | --- |
| Sleeve artwork | Round the sleeve from the cuff to the shoulder, with the join at the underarm; the head's slices are closed by borrowing the shape of a whole ring further down |
| Shirt print extent | Each panel to the seams it is sewn on, unwrapped round the body's and each sleeve's own cross-sections rather than projected onto a plane |
| Tote print extent | The whole of each side, fold to fold and base to mouth, unwrapped round the bag's own cross-sections rather than projected onto a plane |
| Open rims | Real folded hems on the tote mouth and the shirt hem, cuffs and neck |
| Review cadence | One branch per phase, renders reviewed before the next begins |
| Bottle label extent | The whole outside of the body, up to the ring; only the two discs are bare |
| Tote source | Replaced with a closed bag with solid handles, rather than repairing a flat panel |
| Tote lining | Kept — the mouth is open to look into, and the outer skin needs an inside to be closed |
