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

A heavyweight cotton canvas tote with webbing handles.

| Part | Shells | Material | Prints? | Surface |
| --- | --- | --- | --- | --- |
| Front, back, left, right panels | body, by face direction | `Bag_Front`/`Bag_Back`/`Bag_Left`/`Bag_Right` | yes, platen area only | canvas: metallic 0, roughness 0.78, tiled weave normal map |
| Mouth hem | body, folded band at the rim | `Bag_Canvas` | no | as above |
| Base | body, −Y faces | `Bag_Base` | no, colour slot | as above |
| Handles | 2 separate islands | `Bag_Handles` | **never** | webbing, same finish |

The bag is sewn cloth. Its mouth is hemmed — a folded band, real geometry, not
a knife-thin cut edge — so the only remaining boundary is where the handles
meet the body. Canvas does not hold a sharp corner either: the base folds and
the side gussets have a real radius, and the model must too.

Each panel prints a **centred rectangle the size of a real screen-print
platen**, clear of the base fold and the handle stitching. The unwrap covers
that rectangle, not the whole panel, so the template a user downloads is a 1:1
preview of what a printer would actually produce rather than a shape that
disappears under the seams.

### T-shirt

A heavyweight cotton tee, photographed close up.

| Part | Material | Prints? | Surface |
| --- | --- | --- | --- |
| Front, back panels | `Shirt_Front`, `Shirt_Back` | yes | jersey: metallic 0, roughness 0.86, weave normal map on TEXCOORD_1 |
| Sleeve print patches | `Shirt_Sleeve_Left`, `Shirt_Sleeve_Right` | yes, flat patch on the outer upper sleeve | as above |
| Sleeve cloth outside the patch | folded into `Shirt_Front`/`Shirt_Back` | no | as above |
| Collar rib | `Rib_1X1_486gsm_116764` | no | ribbed knit |
| Placket trim, care label | `Shirt_Front_Trim`, `Cotton_Heavy_Twill_116740.004` | no | as authored |

One garment shell, so panels are separated by face direction, not by island.
Hem, cuffs and neck are turned under — 20mm on the body and the cuffs, 10mm at
the neck, each rim reading at twice its cloth. The shirt is shot close up, and a
paper-thin rim is exactly what gives that away. Every panel renders both faces so the
cloth is never see-through from an angle.

A sleeve is a cone and cannot flatten into a square without either distortion
or a cut. So it does not try: the sleeve carries a **flat rectangular print
patch on its outer upper face, about 8 by 8 cm**, which is what a sleeve print
physically is. The patch unwraps with no stretch and no mirroring, and the rest
of the sleeve is plain cloth.

### Water bottle

A powder-coated steel bottle with a screw cap and a swing latch.

| Part | Material | Prints? | Surface |
| --- | --- | --- | --- |
| Body | `Bottle_Body` | yes, one continuous wrap, seam at the back | coated steel |
| Cap, ring, latch | `Bottle_Head_Cap`/`_Ring`/`_Latch` | no, colour slots | as above |

### Tablet folder

A folio with a pen loop and a clasp pin, holding a pad of paper.

The file paints all five of its meshes with one material, so both the colour
slots and the print zone name a mesh alongside it: the zone is
`blinn2@StackOfPaper_blinn2_0`, the pad, and nothing else prints. That material
is metallic 1 at roughness 1 today, which renders it black.

## 3. The test schema

Invariants over the shipped GLBs, read straight out of the files. Each has an
id, a rule, and where it stands today. `—` means the invariant already holds.

### A. Part integrity — a part is one material

| id | Invariant | Today |
| --- | --- | --- |
| A1 | No shell carries both a hardware material and a print material. Hardware is declared per product (`Clip`, `Bag_Handles`). | **card: 1 shell fails. tote: 2 shells fail.** |
| A2 | Every triangle of a hardware shell wears the hardware material — no exceptions, no share threshold. | **card: 176 tris. tote: 161 tris.** |
| A3 | Every material name in the file is claimed by the catalog as a zone, a colour part, or a declared fixed material. | — |

A1 and A2 are the user-visible "the texture overlaps the metal" defect. They
are absolute: not "mostly", not "under 5%". Zero.

### B. Print fidelity — the image lands where it was drawn

| id | Invariant | Today |
| --- | --- | --- |
| B1 | A print zone's unwrap covers ≥ 0.95 of its 0–1 square, measured against the area the zone declares printable (full bleed on the card, platen rectangle on the tote, patch on the sleeves). Below that, part of the template the user is handed never reaches the product. | card 0.987 · tote 0.97–1.00 · shirt 1.00 — · **folder 0.230** |
| B2 | Stretch ≤ 1.25 — the ink per square millimetre in the tightest one per cent of a zone, against the middle of it, so a design lands at an even density. | card 1.00 · tote ≤ 1.04 · shirt ≤ 1.06 — · **bottle 1.35** · **folder 1.60** |
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

| id | Invariant | Today |
| --- | --- | --- |
| C1 | Zero degenerate triangles. | — all five |
| C2 | Zero coincident faces, within or across materials (they z-fight). | — all five |
| C3 | Zero non-manifold edges. | — all five |
| C4 | Open boundary edges match the count the product declares, so a new hole is caught. Today: card 0 (closed), tote 296, shirt 592, bottle 112, folder 124. Hemming does not close a rim — it moves the raw edge inside where it is stitched down and never seen; closing it would mean giving the whole shell a thickness, which the tote and shirt deliberately do not have. | — pins current state |
| C5 | Zero shading-normal splits on an edge the geometry says is flat (< 10° between face normals). | card, tote, shirt, bottle — · **folder 1** |
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

### D. Appearance — physically sane materials

| id | Invariant | Today |
| --- | --- | --- |
| D1 | Every material a product names is `doubleSided`. | — all five |
| D2 | Fabric keeps its authored weave normal map. | — tote, shirt |
| D3 | No material is both fully metallic and fully rough. Metal shows what it reflects rather than a colour of its own, and a fully rough surface reflects nothing coherent, so such a material has neither diffuse nor highlight left and renders near black whatever base colour it names. | card, tote, shirt, bottle — · **folder `blinn2` is metallic 1 / roughness 1** |

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
node scripts/build-template-archives.mjs id-card-templates.zip \
    id-card-front.png id-card-back.png
```

The order matters: a prep script embeds its zone's template as that zone's
starting image, so templates are drawn first. The archives are packed last, and
`app-delivery-schema.test.ts` opens each one and compares it byte for byte
against the PNGs beside it, so a template regenerated without repacking fails.

`prep-model-zones.mjs` is the engine -- it splits one material's triangles into
named zones and gives each its own unwrap -- and `prep-model-geometry.mjs`
answers the two questions it needs about the mesh: which connected component
each face belongs to, and which edges are folds worth rounding. The tablet
folder has no prep script; it ships as bought, with the catalog naming meshes
for its slots.

### The source models

The five sources are licensed assets and are **not committed**. Put them in
`assets/model-sources/` (git-ignored), or point `MODEL_SOURCES` at wherever
they live, under these names:

| Name the scripts ask for | What it is |
| --- | --- |
| `id-card.glb` | the badge and its swivel clasp |
| `tote-bag.glb` | the canvas tote |
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
above: full bleed on the card, a centred platen rectangle on each tote panel, a
flat patch on each sleeve, the existing wrap on the bottle. Each zone reaches
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

### Decisions on record

| Question | Decision |
| --- | --- |
| Sleeve artwork | A flat 8×8 cm patch on the outer upper sleeve, not a full-sleeve wrap |
| Tote print extent | A centred platen rectangle, clear of the base fold and handle stitching |
| Open rims | Real folded hems on the tote mouth and the shirt hem, cuffs and neck |
| Review cadence | One branch per phase, renders reviewed before the next begins |
