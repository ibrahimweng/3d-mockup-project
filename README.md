# Mockup Studio

Photoreal device mockups that render **entirely in your browser** — free,
private, and with no backend. Built on the [Toolcraft](https://toolcraft.sh) app
framework, rendered with [three.js](https://threejs.org) under image-based
lighting.

Drop in a screenshot and it appears on the chosen device's display, lit by a
captured photography studio. Rotate the device by dragging it, pick a focal
length and a backdrop, and export the frame as an image. The screenshot is never
uploaded to a server. There is no API key, no account, and nothing to pay for.

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
| Mac Studio | `mac-studio.glb` | The display, its stand and the machine beside it. Cleaned from a 502k-triangle Draco source: see below |
| Apple Watch Ultra | `apple-watch-ultra.glb` | Nearly square screen, so tall screenshots crop hard |

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

Adding a sixth device is a catalog entry, not a code change.

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
   builder, so the exported frame is the frame the preview showed.

## Controls

| Section | What it does |
| --- | --- |
| Device | Which product the design is shown on, and its finish |
| Screenshot | The design on the display, its position and stretch, and the runtime's rotate and flip actions |
| Screen fit | Fit, fill or stretch, and a scale |
| Studio | Which captured environment lights the device, and how strongly |
| Lights | A placed three-point rig on top of the environment: key intensity and colour, fill, rim |
| Key light direction | Where the key sits, which rakes the light and swings the shadow |
| Camera | Focal length as a full-frame equivalent; drag the device itself to rotate |
| Background | The ground plane behind the device, and its colour |
| Image Export | PNG or JPG, at a 2K, 4K or 8K long edge |

One pointer, three surfaces. Dragging **on the screen** moves the design across
it. Dragging **the body** rotates the device. Dragging **empty canvas** pans the
viewport. The split is decided on pointer-down by what the ray actually hits, so
there is no mode to switch.

Movement is measured in the screen's own UV space rather than in pixels, so the
design keeps up with the pointer even on a screen seen almost edge-on. An axis
that is not cropped has no slack and correctly does not move.

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

## Cleaning a supplied model

`mac-studio.glb` is the worked example, in
[`scripts/clean-model.mjs`](scripts/clean-model.mjs). Its source arrived at
3.5MB, which flattered it: that was Draco compression over 502,646 triangles,
and 34.8MB once decoded. The app loads with a plain `GLTFLoader` and has no
Draco decoder, so it had to come out anyway.

What the pass does, and why each step earned its place here:

- **Drops the unused scene.** The file carried two. The one not used is a full
  studio set built around a 22-metre backdrop, and the app brings its own
  ground and lighting.
- **Simplifies geometry** to 105,046 triangles, bounded by an error tolerance
  rather than a flat ratio, so the simplifier stops early on anything it cannot
  reduce without moving the surface. A rounded aluminium box does not need six
  figures of triangles; the base pad alone was 224,764 for something 88mm
  across.
- **Rebuilds the display's unwrap.** The panel shipped mapped into a corner of
  a shared atlas — u from 0.02 to 0.45 — which is fine for a baked wallpaper
  and useless for a design supplied at runtime. It is now a clean 0..1 across
  the panel, derived from the geometry.
- **Quantizes** positions, normals and texture coordinates, which is most of
  the remaining size for none of the accuracy that matters at this scale.

The result is 2.4MB and loads without a decoder.

## Preview resolution

The preview draws at the display's own pixel ratio, capped at 2, and at 0.6 of
that while a drag is in flight. Resolution scale lowers that ceiling; it cannot
raise it, because a display cannot show more pixels than it has.

Export does not go through this canvas. `export-renderer.ts` builds its own
renderer at the requested size, so the picture you download is unaffected by
anything here.

## Known issues

- `src/app/render/device-scene.ts` imports `GLTFLoader` and `RGBELoader`, which
  Toolcraft's product-boundary checker rejects, so `npm test` fails on those two
  lines. The sanctioned alternative — a model `fileDrop` backed by runtime
  presentation — cannot express bundled device geometry or HDR environments,
  because `media.defaultAssets` accepts only base64 data URLs.

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
