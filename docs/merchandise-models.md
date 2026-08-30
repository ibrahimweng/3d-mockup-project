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
| `card-prep` | `centroid.y > 1.73` is the clip | 176 clasp triangles wear card materials, 48 of them the printed artwork |
| `card-prep` (earlier) | atlas `v > 0.66` is the clip | the card's top band rendered as brushed metal |
| `tote-prep` | `centroid.y > 6.51` is a handle | 161 handle triangles wear the front and back print |

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
| Front, back, left, right panels | body, by face direction | `Bag_Front`/`Bag_Back`/`Bag_Left`/`Bag_Right` | yes | canvas: metallic 0, roughness 0.78, tiled weave normal map |
| Base | body, −Y faces | `Bag_Base` | no, colour slot | as above |
| Handles | 2 separate islands | `Bag_Handles` | **never** | webbing, same finish |

The bag is sewn cloth, so it is an open surface: the mouth rim and the handle
attachments are genuine boundaries, not holes to be closed. Canvas does not
hold a knife-sharp corner — the base folds and the side gussets have a real
radius, and the model must too.

### T-shirt

A heavyweight cotton tee, photographed close up.

| Part | Material | Prints? | Surface |
| --- | --- | --- | --- |
| Front, back panels | `Shirt_Front`, `Shirt_Back` | yes | jersey: metallic 0, roughness 0.86, weave normal map on TEXCOORD_1 |
| Sleeves | `Shirt_Sleeve_Left`, `Shirt_Sleeve_Right` | yes | as above |
| Collar rib | `Rib_1X1_486gsm_116764` | no | ribbed knit |
| Placket trim, care label | `Shirt_Front_Trim`, `Cotton_Heavy_Twill_116740.004` | no | as authored |

One garment shell, so panels are separated by face direction, not by island.
Hem, cuffs and neck opening are real boundaries. Every panel renders both
faces so the cloth is never see-through from an angle.

### Water bottle

A powder-coated steel bottle with a screw cap and a swing latch.

| Part | Material | Prints? | Surface |
| --- | --- | --- | --- |
| Body | `Bottle_Body` | yes, one continuous wrap, seam at the back | coated steel |
| Cap, ring, latch | `Bottle_Head_Cap`/`_Ring`/`_Latch` | no, colour slots | as above |

### Tablet folder

A folio with a pen loop and a clasp pin. Single material as bought; the colour
slots repaint it per node.

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
| B1 | A print zone's unwrap covers ≥ 0.95 of its 0–1 square. Below that, part of the template the user is handed never reaches the product. | card 0.998/0.999 — · **tote 0.743–0.820** · **shirt 0.809–0.869** |
| B2 | Stretch (longest/shortest axis ratio of the unwrap) ≤ 1.25, so a circle drawn on the template is a circle on the model. | card 1.00, tote 1.05 — · shirt panels 1.13/1.18 — · **sleeves 2.06/2.11** |
| B3 | Zero mirrored triangles within a zone: every triangle in a zone has the same UV handedness, or the artwork folds back on itself. | card 0, tote 0 — · **shirt 156/411/678/667** |
| B4 | A zone's triangles form one connected UV island, so text is never cut across a gap. | to measure |
| B5 | Each template PNG's aspect ratio matches its zone's measured world aspect within 2%. | to measure |

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
| C2 | Zero coincident faces, within or across materials (they z-fight). | card/tote/shirt/folder — · **bottle 1759, 352 across materials** |
| C3 | Zero non-manifold edges. | card/tote/shirt/folder — · **bottle 404** |
| C4 | Open boundary edges match the count the product declares, so a new hole is caught. Card 0 (closed), tote 288, shirt 554, bottle 112, folder 124. | — pins current state |
| C5 | Zero shading-normal splits on an edge the geometry says is flat (< 10° between face normals). | tote/shirt/bottle 0 — · **card 38** · folder 1 |
| C6 | On soft goods, no interior edge exceeds 45° between face normals — cloth does not hold a knife edge. | **tote: 69 edges 30–60°, 7 over 60°** · **shirt: 634 and 182** |

C6 is the real answer to "the tote has very sharp edges". Its shading is
already continuous — zero splits — so the sharpness is geometry at the base
fold and the gussets, and only geometry will fix it.

### D. Appearance — physically sane materials

| id | Invariant | Today |
| --- | --- | --- |
| D1 | Every material a product names is `doubleSided`. | — all five |
| D2 | Fabric keeps its authored weave normal map. | — tote, shirt |
| D3 | Metal is metallic 1 with roughness ≤ 0.4; cloth, card and coating are metallic 0 with roughness ≥ 0.4. A fully metallic, fully rough material has no diffuse and no highlight, so it renders black. | card, tote, shirt — · **folder `blinn2` is metallic 1 / roughness 1** · bottle body metallic 0.3 |

## 4. The plan

One phase per group. Each phase lands its tests **first**, red, then the prep
change that turns them green, then a rendered proof sheet. Nothing from a later
phase is touched early, and no phase merges with another phase's test failing.

**Phase 0 — the schema, red.** Add the invariants above as tests against the
files as they ship. Expect A1, A2, B1, B2, B3, C2, C3, C5, C6 and D3 to fail.
That failing list is the agreed definition of the defect, and it is the thing
that stops a later fix from silently undoing an earlier one.

**Phase 1 — part integrity (A).** Replace threshold classification with
shell-first classification in `card-prep` and `tote-prep`: split the mesh into
connected components, name each component, and only then subdivide the one
body component by face direction. Deletes `CLASP_Y` and `HANDLE_Y`. Fixes the
clasp overlap and the printed handles.

**Phase 2 — print fidelity (B).** Re-unwrap the tote panels and the shirt so
each zone fills its square, no zone mirrors against itself, and stretch stays
under 1.25. The sleeves need a decision, not just a better projection — see
question 1. Regenerate the templates from the new unwraps so the download
matches what actually prints.

**Phase 3 — surface quality (C).** Round the tote's base fold and gussets and
the shirt's sharp edges to under 45°; heal the card's 38 flat shading splits;
rebuild the bottle's coincident and non-manifold geometry.

**Phase 4 — appearance (D).** Give the folder a physically sane material and
re-unwrap it (coverage 0.542, stretch 3.79 today).

Each phase is a separate commit with before/after renders at the same camera,
so a regression is visible rather than argued about.
