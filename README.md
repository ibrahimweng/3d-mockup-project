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
| iPhone 17 Pro Max | `iphone-17-pro-max.glb` | Default |
| iPhone 17 Pro Max (Orange) | `iphone-5.glb` | Named for an iPhone 5, but holds the same phone in an orange finish |
| MacBook | `macbook.glb` | Scene `Scene.002`; the file also holds an iPhone and an iMac |
| Studio Display | `macstudio.glb` | Scene `Exp`; the default scene stacks two displays |
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
- `public/models/*.glb` — the five device models listed above.

Model provenance is not recorded anywhere in the repo. If these came from a
source with attribution or licensing terms, that belongs here before the site is
promoted anywhere public.

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
