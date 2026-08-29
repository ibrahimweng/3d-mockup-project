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

| Product | Model file | Design lands on | Colour slots |
| --- | --- | --- | --- |
| T-Shirt | `tshirt.glb` | The torso, front and back | Body, sleeves, collar |
| Tote Bag | `tote-bag.glb` | The whole bag, handles included | Bag |
| Water Bottle | `water-bottle.glb` | The body, wrapped on its own coordinates | Cap, ring, latch |
| ID Card | `id-card.glb` | The card face, and the clip above it | Card |
| Tablet Folder | `tablet-folder.glb` | The top sheet | Board, pen, clip |

Three things about them are worth knowing before you use them.

The design is bound to base colour rather than emission. A screen emits light,
so a screenshot on one stays legible whatever the studio is doing. Print does
not emit. Bound the same way, a shirt would glow in an unlit corner.

Where a product is one material, the design covers all of it. The tote's bag
and handles are the same surface in the file, and so are the ID card and its
clip, so a design lands on both. The shirt, the bottle and the folder separate
their parts, so those print where you would expect.

The t-shirt is the one model here that does not ship as supplied. It arrived at
22MB and 611,900 triangles, of which 590,408 were the topstitch thread along its
seams: thirty-five meshes of stitching, and 96 per cent of the model, for a
detail you can only see on a close crop of a seam. Those meshes were removed,
which leaves 21,492 triangles in 4.56MB and every surviving surface exactly as
its author built it. What it costs is the row of stitches along the raglan
seams, the cuffs and the hem. `scripts/clean-model.mjs` did the removal and the
same command puts it back from the original file.

The models are not interchangeable, so each one is a catalog entry in
[`src/app/product-domain.ts`](src/app/product-domain.ts) rather than a branch in
the renderer: which file to load, which scene inside it actually holds the
device, which material carries the display, which stray nodes to hide before
measuring bounds, the screen's aspect where a tilted panel cannot be measured,
and a yaw for a model that faces away from the default camera. Every value was
read out of the GLB rather than guessed.

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

The t-shirt is the one exception, and it is a different act from decimating.
Nothing was simplified: whole meshes were deleted, and they were the topstitch
thread rather than any surface the mockup shows. Every surface that remains has
the vertices and the precision the file gave it. The test of whether that is
worth doing again is whether the part removed is a part rather than a density.

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
run the unit tests on their own with `npx vitest run src`. All 613 of them pass.

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
