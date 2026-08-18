# Plinth

Photoreal device mockups that render **entirely in your browser** — free,
private, and with no backend. Built on the [Toolcraft](https://toolcraft.sh) app
framework, rendered with [three.js](https://threejs.org) under image-based
lighting.

Live at **https://3d-mockup-project-main.vercel.app**. The web app is the whole
product: there is nothing to install and nothing that runs on your machine.

Drop in a screenshot and it appears on the phone's display, lit by a captured
photography studio. Rotate the phone by dragging it, choose a focal length,
pick a backdrop, and export the frame as an image. The screenshot is never
uploaded to a server. There is no API key, no account, and nothing to pay for.

## Develop

```bash
npm install
npm run dev
```

## Deploy

It is a static site — `npm run build` produces `dist/`, which any free static
host serves (Vercel, Netlify, GitHub Pages, Cloudflare Pages). There are no
serverless functions and no environment variables.

## How a render works

1. The phone model and the selected `.hdr` environment load once. The
   environment is convolved through three.js's `PMREMGenerator` into mip levels
   representing increasing roughness — this is the entire lighting model, and
   there are no separate lights to place.
2. The uploaded screenshot is decoded into a texture and bound to the display
   material's *emissive* channel, so it reads at full brightness regardless of
   how the environment happens to be lighting the rest of the phone. Fit mode,
   scale, position and stretch rewrite that texture's repeat and offset; none of
   them rebuild the scene.
3. Every frame is a single raster pass. There is no accumulator and nothing to
   converge, so orbiting the camera costs one draw call and an idle scene does
   no work at all.
4. Export builds a second renderer at the artifact's own resolution and draws
   one frame. Because nothing accumulates, that frame is deterministic and
   identical to what the preview showed.

## Controls

| Section | What it does |
| --- | --- |
| Screenshot | The image on the display, plus fit mode, scale, position and stretch |
| Studio | Which captured environment lights and is reflected by the phone |
| Camera | Focal length as a full-frame equivalent; drag the phone itself to rotate |
| Background | The ground plane behind the phone, and its colour |
| Image Export | PNG or JPG, at a 2K, 4K or 8K long edge |

Dragging the phone rotates it; a drag that misses falls through to the canvas
and pans the viewport.

## Assets and licensing

- `public/hdri/*.hdr` — four 1K environment maps, CC0 from
  [Poly Haven](https://polyhaven.com). See
  [`public/hdri/CREDITS.md`](public/hdri/CREDITS.md) for the per-file mapping
  and why 1K is deliberate.
- `public/models/iphone-17-pro-max.glb` — the device the renderer loads.
- `public/models/` also contains `Macbook.glb`, `macstudio.glb`,
  `Apple Watch 8 Ultra.glb` and `Orange iphone 5.glb`. These ship with the repo
  but the current renderer does not reference them; several are multi-scene
  files that hold more than one device.

Model provenance is not recorded anywhere in the repo. If these came from a
source with attribution or licensing terms, that belongs here before the site is
promoted anywhere public.

## Performance note

Lighting is image-based rather than traced. Shadows come from a single
directional shadow map instead of true area-light occlusion, reflections sample
the environment map only, and depth of field is not simulated — so the phone
cannot reflect the ground plane or itself, and everything renders sharp. The
trade is interaction: a path-traced version restarts a convergence on every
camera move and holds the GPU at full load for seconds, where this stays at
frame rate while you move it around.

The largest cost is the initial load — the model and the environment convolution
— not the frames that follow.
