# Mockup Studio

Photoreal product mockups that render **entirely in your browser** — free,
private, and with no backend. Built on the [Toolcraft](https://toolcraft.sh) app
framework, rendered with [three.js](https://threejs.org) under image-based
lighting.

Drop in a screenshot and it appears on the chosen device's display, lit by a
captured photography studio. Choose a piece of merchandise instead and the same
image is printed on it. Rotate the device by dragging it, pick a focal
length and a backdrop, and export the frame as an image. You can also keyframe
the device and export a short video, which is covered under
[Animation](#animation) below. The screenshot is never uploaded to a server.
There is no API key, no account, and nothing to pay for.

## Develop

```bash
npm install
npm run dev
```

## Deploy

It is a static site — `npm run build` produces `dist/`, which any free static
host serves (Vercel, Netlify, GitHub Pages, Cloudflare Pages). There are no
serverless functions and no environment variables. `vercel.json` pins the Vite
framework preset, the `npm run build` command and the `dist` output directory.

## Devices

| Device | Model file | Notes |
| --- | --- | --- |
| iPhone 17 Pro Max | `iphone-5.glb` | Default. Named for an iPhone 5, but holds a 17 Pro Max in orange. Its back panel's colour is printed into a texture, so a colourway repaints it rather than tinting it |
| MacBook | `macbook.glb` | Scene `Scene.002`; the file also holds an iPhone and the iMac below |
| iMac | `macbook.glb` | Scene `Scene.001`; the 24-inch model, sharing the MacBook's download |
| Mac Studio | `mac-studio.glb` | The display, its stand and the machine beside it. Shipped exactly as supplied, Draco and all; repaired at load rather than in the file |
| Apple Watch Ultra | `apple-watch-ultra.glb` | Nearly square screen, so tall screenshots crop hard |

## Merchandise

These carry a printed design rather than a display. The same upload, the same
studio and the same export work on all of them.

| Product | Model file | Upload slots | Colour slots |
| --- | --- | --- | --- |
| T-Shirt | `tshirt.glb` | Front, Back, Left sleeve, Right sleeve | Collar rib, hem facing |
| Tote Bag | `tote-bag.glb` | Front, Back, Left side, Right side | Handles, trim, base |
| Water Bottle | `water-bottle.glb` | One, wrapped 360° around the body | Cap, ring, latch |
| ID Card | `id-card.glb` | Front, Back | Clip, card edge |
| Tablet Folder | `tablet-folder.glb` | One, on the top sheet | Board, pen, clip |

### Where the design lands, and why it flows

Every merchandise model here was re-unwrapped. The UVs these files shipped with
were authored for the texture the model came with — packed as islands, with the
space between them that packing needs, and with each island scaled to whatever
that particular texture wanted. An uploaded design laid over them lands in
pieces: a logo that crosses an island boundary is cut in half and the halves
arrive somewhere else on the product. The bottle was the clearest case, using
57 per cent of its U range with the base disc parked beside the wall as a
separate island, so a wrap-around design covered a bit over half the bottle and
then started again.

What ships now is one continuous unwrap per print zone, each filling 0..1 with
no island and no gap, computed from the geometry rather than from any texture:

- **The bottle body** is unwrapped cylindrically — angle around the axis to U,
  height to V — so one image wraps the whole bottle and meets itself at the
  seam behind. Triangles crossing the seam are repaired individually, which is
  why there is no visible join. It is the only product whose upload skips the
  fit-to-frame step, because refitting a cylinder to a rectangle is what put
  the design on half of it. The head is a separate part in plastic.
- **The card** carries two zones. Front and back are the same size and each
  fills its own 0..1, so front and back take separate uploads. The clip is
  metal and takes no design.
- **The tote** carries four: front, back, left and right. The bag was also too
  flat to read as a bag holding anything — 2.8 units through where it is 5.7
  across — so the panels are pushed apart to 5.1, which is what gives the sides
  enough width to print on.
- **The shirt** carries four: front, back and a sleeve each.

The shirt's zones are cut on the pieces the modeller already separated — the
front panel, the back panel and each sleeve are distinct primitives in the file
— rather than on which way a triangle faces. That distinction turned out to
matter more than it sounds. A normal-direction threshold cuts a ragged boundary
wherever the surface curves through it, and a shoulder is exactly where the
surface turns over: a quarter of the front panel fell outside any threshold and
came out as a torn grey band down the shoulder and sleeve seams. Splitting on
the garment pieces gives every face a zone, and leaves 708 triangles of hem
facing as the only untextured cotton, which is what a hem facing is.

### Templates

`public/templates/` holds a placeholder image for every print zone, and each
one is what the model actually renders until a design is uploaded. They are
sized to the zone's measured aspect, carry a grid, a centre cross, a margin box
and their own dimensions printed on them, so a design built to one of these
arrives at the size and orientation it was drawn at.

| Zone | Template | Pixels |
| --- | --- | --- |
| Bottle body | `water-bottle-body.png` | 2048 × 1811 (1.13 : 1) |
| Card front / back | `id-card-front.png`, `id-card-back.png` | 1426 × 2048 |
| Tote front | `tote-bag-front.png` | 1833 × 2048 |
| Tote back | `tote-bag-back.png` | 1905 × 2048 |
| Tote left / right | `tote-bag-left.png`, `tote-bag-right.png` | 910 × 2048, 804 × 2048 |
| Shirt front | `tshirt-front.png` | 1237 × 2048 |
| Shirt back | `tshirt-back.png` | 1189 × 2048 |
| Shirt sleeves | `tshirt-sleeve-left.png`, `tshirt-sleeve-right.png` | 1326 × 2048, 1356 × 2048 |

The bottle's is the one to look at first: it is marked at the quarter turns, so
you can see which part of a 360° wrap faces the camera before drawing anything
on it.

**Download** under Templates hands them back. A product with one zone gives you
that PNG; a product with several gives you a zip, one file per zone. What comes
down is the file the model was built from rather than anything regenerated — a
design drawn over a template lands where it was drawn only while the two are
the same image, so there is one copy of each and the download links straight at
it. Devices have no Templates section: a screen has proportions but no printed
sheet.

The archives are committed beside the images and rebuilt with
`node scripts/build-template-archives.mjs <archive.zip> <name.png>...`. A test
opens each one and compares every entry against the file on disk, because an
archive that has fallen behind is worse than none — it looks right and lands a
design somewhere it was not drawn for.

Uploading a design replaces the template on the zone the upload is bound to.
Clearing the upload puts the template back, which is why the template is
captured alongside the model's other print maps rather than being a starting
value that gets overwritten.

### Uploading to a zone

The Screenshot section carries an uploader per zone: the unlabelled drop zone at
the top is the front, and Back, Left and Right appear underneath on the products
that have them. A card shows two, a tote and a shirt show four, a bottle and
every device show one, because which slots exist is read off the catalog rather
than listed in the panel — declaring a zone is the single act that offers its
upload.

Four slots rather than a slot per named part, for the same reason there are
three colour slots rather than one per part: schema controls are static, so a
product cannot declare "left sleeve" and have a control appear for it. Left and
right mean the same thing on every product — the side you see on the left of an
unrotated model — so the shirt's left sleeve and the tote's left panel are the
same slot.

Each slot is independent. Uploading to one leaves the others as they were,
clearing one puts that zone's template back and leaves the rest printed, and the
rotate and flip actions under each uploader turn that zone's image alone. The
export reads the same four slots the canvas does, so the file matches the frame
you were looking at.

The controls they share are Screen fit and Print background: Fit, Fill,
Stretch, scale, position, stretch and the colour under the design apply to
every zone at once. A design fitted to the front
is fitted to the back with it. That is a real limit rather than an oversight —
per-zone placement would be four more sections of the same six controls — and it
matters most where two zones are different shapes, which is the tote, whose
sides are about half the width of its front.

### Transparency, and what shows through it

A real print file is a mark on nothing: the areas that are not ink are
transparent, because the garment is what shows through them. Bound straight to
an opaque surface that is not what happens. three.js samples the colour
channels and ignores alpha, and a transparent pixel is stored as black with
zero alpha, so a logo on a transparent ground used to turn the whole shirt
front black — measured at RGB (12, 11, 11) against (213, 210, 208) for the
sleeve beside it.

**Print background**, under the uploaders, is the colour the design is laid
over. It defaults to white, which is the blank stock all of these products are,
so a transparent PNG now prints as a mark on white fabric without anyone
touching the control. Picking a colour prints it on that colour instead.

It is composited into the bitmap when the image is decoded rather than made
into a transparent material. Transparency on a garment would have to be sorted
against itself every frame — a shirt's front and back panels overlap — and the
export would have to reproduce the same sort to match the canvas. Flattening it
once at decode keeps every surface opaque and makes the two identical by
construction.

It reaches the zones that carry a design and no others. A shirt with a
transparent front and nothing on its sleeves prints the background on the front
and leaves the sleeves on their templates, because there is no design there to
put anything under. The colour under a design is a different thing from the
colour of the garment, and only the first is built.

### What is not built yet

Fit, scale, position and stretch are shared across a product's zones, as noted
above. Per-zone placement is not built.

### How the design is bound

The design is bound to base colour rather than emission. A screen emits light,
so a screenshot on one stays legible whatever the studio is doing. Print does
not emit. Bound the same way, a shirt would glow in an unlit corner.

A print zone is deliberately not also a colour slot. Repainting a part writes
its base colour and clears its map, so a card face that was both would lose its
template the moment a colourway was picked. The parts a colour picker can reach
are the ones that carry no print: the bottle's cap, ring and latch, the card's
clip and edge, the tote's handles, trim and base, the shirt's collar rib and its
hem facings. The shirt has two rather than three because its four print
zones cover every panel, and a slot with nothing left to paint is worse than
no slot.

The models are not interchangeable, so each one is a catalog entry in
[`src/app/merchandise-catalog.ts`](src/app/merchandise-catalog.ts) rather than a
branch in the renderer: which file to load, which scene inside it actually holds
the product, which material carries the print, which stray nodes to hide before
measuring bounds, the aspect where a tilted panel cannot be measured, and a yaw
for a model that faces away from the default camera. Every value was read out of
the GLB rather than guessed.

Each device also declares the materials that make up its shell, so one
colourway is a single colour rather than a list: `Natural` leaves the model
exactly as its author built it, and the rest repaint the shell while keeping the
metalness and roughness that make an enclosure read as brushed or polished. A
device with parts that are deliberately a different colour — a watch band
against its case — declares those as accents.

Adding another product is a catalog entry, not a code change. A merchandise
entry names the material the design prints on, and up to three parts a colour
picker can reach. Where a file paints a whole product with one material and
separates the parts by mesh instead, the entry asks for the material to be
split per mesh at load, which gives each part a name without touching the file.

## How a render works

1. The device model and the selected `.hdr` environment load once. The
   environment is convolved through three.js's `PMREMGenerator` into mip levels
   representing increasing roughness — this is the entire lighting model, and
   there are no separate lights to place.
2. The uploaded design is decoded into a texture and bound to every display
   material on the device, on the *emissive* channel, so it reads at full
   brightness regardless of how the environment happens to be lighting the rest
   of the device. Rotate and flip are baked into that bitmap, along with any
   correction the model's own screen UVs need. Fit mode, scale, position and
   stretch then rewrite the texture's repeat and offset; none of them rebuild
   the scene.
3. A three-point rig is placed on top of the captured environment. The key is
   the only shadow caster, because a second caster reads as two suns.
4. Every frame is a single raster pass. There is no accumulator and nothing to
   converge, so orbiting the camera costs one draw call and an idle scene does
   no work at all.
5. Export builds a second renderer at the artifact's own resolution and draws
   one frame. Preview and export read the same settings through the same scene
   builder, so the exported frame is the frame the preview showed. A video
   export runs that same path once per frame, at thirty frames a second, and
   hands the frames to an encoder.

## Controls

| Section | What it does |
| --- | --- |
| Device | Which product the design is shown on, and its finish |
| Parts | Up to three colours for a merchandise product's own surfaces. Each picker appears only for a product that has that part |
| Screenshot | The design on the display, its position and stretch, and the runtime's rotate and flip actions |
| Screen fit | Fit, fill or stretch, and a scale |
| Studio | Which captured environment lights the device, and how strongly |
| Lights | A placed three-point rig on top of the environment: key intensity and colour, fill, rim |
| Key light direction | Where the key sits, which rakes the light and swings the shadow |
| Camera | Focal length as a full-frame equivalent; drag the device itself to rotate |
| Framing | Where the subject sits in the picture, so you can leave room beside it for a headline. The projection shifts rather than the camera swinging, so nothing leans |
| Surface | What the device stands on: none, stone, oak, steel or glass. Offered only for the devices a table suits |
| Backdrop | Sweep height and curve, the backdrop and room lights, and the sweep's reflection and roughness |
| Background | Whether the background is drawn at all, and its colour |
| Image Export | PNG or JPG, at a 2K, 4K or 8K long edge |
| Video Export | MP4 or WebM, at the canvas size or 4K |
| Deliver | The Export PNG and Export Video buttons |

One pointer, three surfaces. Dragging **on the screen** moves the design across
it. Dragging **the body** rotates the device. Dragging **empty canvas** pans the
viewport. The split is decided on pointer-down by what the ray actually hits, so
there is no mode to switch.

Movement is measured in the screen's own UV space rather than in pixels, so the
design keeps up with the pointer even on a screen seen almost edge-on. An axis
that is not cropped has no slack and correctly does not move.

## Animation

The timeline is on, and it works in keyframes. A loop is six seconds by
default. That is one unhurried revolution, and it divides evenly into the
thirtieth-of-a-second frames a video export is cut into.

Most controls can be keyframed, so you can animate the device or the camera by
hand. There is also one preset, Turntable, which lays down a single track that
takes Spin from 0 to 360 degrees across the whole loop. That track is linear on
purpose. The editor's usual ease-in-out is right for a move that starts and
stops, and wrong for one that repeats, because the device would slow to a stop
at the top of the revolution and jerk as the loop came round again.

Video export writes MP4 or WebM. The format you pick is the format you get.
Inside an MP4 the encoder prefers H.264, and it falls back to AV1 when the
browser has no H.264 encoder, which is the case on most Linux machines. WebM
uses VP9. The resolution ceiling is 4K rather than the 8K a still can reach,
because a six-second loop is a hundred and eighty frames and the same ceiling
would be a hundred and eighty times the work.

## Assets and licensing

- `public/hdri/*.hdr` — four 1K environment maps, CC0 from
  [Poly Haven](https://polyhaven.com). See
  [`public/hdri/CREDITS.md`](public/hdri/CREDITS.md) for the per-file mapping
  and why 1K is deliberate.
- `public/models/*.glb` — the device models listed above. `macbook.glb` carries
  the MacBook and the iMac in sibling scenes, so the two share one download.

Model provenance is not recorded anywhere in the repo. If these came from a
source with attribution or licensing terms, that belongs here before the site is
promoted anywhere public.

## Taking a supplied model as it is

A supplied GLB ships byte for byte and is repaired at load instead. Decimating
geometry to save bytes costs exactly the surface quality a mockup exists to
show, and every model has needed a different repair anyway, so the repairs are
catalog entries rather than a baked file.

The merchandise models are the exception, and what was done to them is not
decimation. Nothing was simplified: their UVs were rebuilt, because the ones
they shipped with were authored for a texture that is no longer on them, and a
mockup that cannot lay a design flat has nothing left to show. Every vertex
position is the one the file gave it — the tote is the single exception, and
its panels were pushed apart deliberately, which is recorded above.

The t-shirt was briefly stripped of its topstitch, at 590,408 triangles of
thread over thirty-five meshes, which took it from 22MB to 4.56MB. It is back:
those seams are the detail that makes the render read as a garment rather than
a shape, and 23MB is the price. `scripts/clean-model.mjs` still does the
removal, and the test of whether that is worth doing is whether the part
removed is a part rather than a density.

`mac-studio.glb` is the worked example. It arrived at 3.4MB, which flattered
it: that is Draco compression over 502,646 triangles, 34.8MB once decoded. The
loader carries a Draco decoder (`public/draco`, WebAssembly, on a worker) so
the file needs neither decompressing nor decimating.

Three things about it are declared in
[`src/app/product-domain.ts`](src/app/product-domain.ts) and applied by the
scene builder:

- **`sceneName`** — the file carries a second scene built around a 22-metre
  studio backdrop. The app brings its own ground and lighting, so it loads the
  one it wants.
- **`creaseAngleDegrees`** — its flat panels are welded to their rounded
  bevels, so the corner normals hold an average of both and the flat face
  shades as a gradient between them. The giveaway is a soft fan spreading from
  a corner rather than a highlight where the light is. Normals are recomputed
  with a crease threshold, which gives flat faces one normal each and leaves
  the fillets smooth.
- **`screenUnwrap`** — the display is mapped into a corner of a shared atlas,
  u from 0.02 to 0.45. Fine for a wallpaper baked into the file, useless for a
  design supplied at runtime, so the panel is re-unwrapped from its geometry.

[`scripts/clean-model.mjs`](scripts/clean-model.mjs) does both jobs. Its
`--drop-material` removes every mesh painted with a named material, and
`--keep-geometry` skips the welding, simplification and quantisation so the
surfaces that remain are untouched. Its simplifier still exists for a model that
genuinely needs reducing, and is not on the path any model takes by default.

## Sharpness

Three things decide how much detail survives, and all three were losing some.

**Export resolution.** The runtime hands the product renderer a frame in CSS
units and a separate pixel ratio, having already scaled the destination context
by that ratio. Rendering at the CSS size and letting `drawImage` stretch the
result is an upscale: a 2x export carried half the detail it claimed. The ratio
is applied to the render instead, so every pixel in the artifact is one the
renderer drew. Measured on a 3277x4096 export of a one-pixel grid, edge energy
per pixel went from 6.98 to 13.61.

**Anisotropy.** A display is almost never seen square on, and a foreshortened
surface sampled without anisotropic filtering takes a mip level chosen for its
narrowest axis, so the whole panel blurs to match the most compressed
direction. Screen textures now request the highest anisotropy the context
supports.

**Preview resolution.** Full sharpness is the default, dragging included.
Resolution only drops once frames have actually been late, and climbs back as
soon as they are not — see the adaptive policy in `adaptive-quality.ts`.
Resolution scale lowers the ceiling; it cannot raise it, because a display
cannot show more pixels than it has.

## Known issues

`npm test` does not pass. The command has four steps. The second step is
`check-toolcraft-integrity`, and it fails, so the unit tests never run. You can
run the unit tests on their own with `npx vitest run src`. All 621 of them pass.

The integrity check fails for two reasons.

The first reason is five places where product code imports something the
framework does not allow. Three of them are in
`src/app/render/device-assets.ts`, which imports `DRACOLoader`, `GLTFLoader`
and `RGBELoader` from three.js. The other two are in
`e2e/app-browser-keyframe-easing.spec.ts` and
`e2e/app-browser-timeline-transport.spec.ts`, which import `test` straight from
Playwright instead of the wrapper the framework provides. The approved way to
load a model is a `fileDrop` control in the schema, and it cannot hold what this
app ships. Every entry in `media.defaultAssets` carries
its file contents inline as a `dataUrl` string, so the four model files and the
four environment maps would have to sit in the bundle as base64 text. Those
files come to about 41MB.

The second reason is 57 framework-owned files that no longer match the signed
manifest. They break down like this:

- 37 files under `src/toolcraft/`
- 10 files under `e2e/`
- 4 files under `scripts/`
- 3 files under `src/app` and `src/routes`
- 2 files under `docs/toolcraft`
- `index.html`

Every one of those changes was deliberate. You can find the reasoning for each
one in [`agent-worklog.md`](docs/toolcraft/agent-worklog.md).

`npm run verify:delivery` has never passed, and nothing done inside this
repository can make it pass. It stops at the same integrity check, so none of
the later stages run. Those stages are the build, the unit tests and the browser
tests. The manifest is signed, so only the holder of the framework's private key
can reissue it. The 37 changed files under `src/toolcraft/` are written out as a
patch at
[`timeline-and-runtime.patch`](docs/toolcraft/upstream/timeline-and-runtime.patch),
so whoever reissues the manifest can review those changes instead of working out
what they were.

`RGBELoader` is deprecated in three.js 0.185. It still works. You will see a
warning in the console each time an environment map loads. `HDRLoader` replaces
it.

## Repository layout

- `src/app` — the product: schema, controls, renderer, export, and the Toolcraft
  acceptance and performance contracts.
- `src/toolcraft` — an immutable signed copy of the Toolcraft runtime. Do not
  edit it; fix the framework and regenerate.
- `docs/toolcraft` — the local contract documents, plus
  [`agent-worklog.md`](docs/toolcraft/agent-worklog.md), which records the
  product decisions and the evidence behind them.
- `public/models` — the GLBs, and `public/templates` — a placeholder image
  for every print zone, which is also what each model renders before an upload.
- `src/app/product-applicability.ts` — which products offer which controls,
  computed from the catalog so a slot and its control cannot disagree.
- `legacy/procedural-scenes` — superseded code that built devices from geometry
  before real GLB models arrived. Kept outside `src/` deliberately so the
  code-health gates do not scan it.

## Performance note

Lighting is image-based rather than traced. Shadows come from a single
directional shadow map instead of true area-light occlusion, reflections sample
the environment map only, and depth of field is not simulated. The trade is
interaction: a path-traced version restarts a convergence on every camera move
and holds the GPU at full load for seconds, where this stays at frame rate while
you move it around.

The largest cost is loading a device and convolving its environment, not the
frames that follow.
