# Implementation Worklog

This file records product decisions and the evidence behind them. Keep it short, factual, and current. Update it after schema, renderer, timeline, layer, export, performance, or acceptance decisions.

## Status

Mode: product

Mockup Studio renders a screenshot on the screen of one of five Apple device models, lit by a captured studio environment, and exports the framed result as an image. It is a reference-runtime clone of the `3d-mockup-project` repository's Plinth app, extended with a device picker.

## Automatic Delivery Lifecycle

Keep this worklog human-shaped. For the first product delivery, record the request, decisions, state/output mapping, reference evidence, rejected alternatives, and known risks; one bare `npm run verify:delivery` derives complete contract proof, one build, full functional acceptance, and no measured performance. For later ordinary edits, record new intent and material decisions, the exact unit/component test, and acceptance IDs passed to `npm run test:feature`; selector expansion is automatic, while explicit `--all` records why the edit could not be bounded. Do not claim or run another aggregate functional delivery.

Classifier output establishes complaint authority only and never path localization. A localized performance complaint adds the domain authority below, then one bare `npm run verify:delivery` runs one targeted iteration. If localization remains unresolved regardless of classifier result, ask one user-facing question naming visible operations and offering targeted diagnosis or a complete review; record neither `performance-iteration` intent nor canonical path authority until the answer supplies exact localization evidence. Never ask the user to choose internal path IDs. A broad or honestly unlocalizable problem may present that single choice with a recommendation for complete review, but the user still chooses. A direct complete-review request needs no further clarification. The full audit remains separate and requires an explicit operator request or accepted offer before `npm run verify:perf` may run. Protected receipts own changed files, plans, checks, reports, measurements, and pass/fail evidence.

When `canvas.renderScale` is enabled, record the renderer decision to preserve selected backing quality and map it to functional `renderScaleCoverage` for interaction and steady state, plus playback when timeline is enabled. The worklog may name the protected `canvas-render-scale-backing` recipe, but it cannot claim its evidence or turn a quality failure into performance authority.

## Performance Iteration Entry Contract

For high-confidence ordinary work, record `Performance intent: ordinary-product-work`. For unresolved localization, whether classification returned high-confidence `performance-iteration` or `needs-agent-judgment`, record the unresolved visible operation but no `Performance intent: performance-iteration` field or `Performance paths` until the user's one clarification provides exact localization. For a localized performance complaint or post-clarification targeted choice, record exactly these domain fields in the latest iteration:

```md
- Performance intent: performance-iteration
- Performance request evidence: "<verbatim exact Request quote>"
- Performance paths: ["performance-path:%5B...%5D"]
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
```

The quoted evidence must be an exact nontrivial raw substring of `Request` with identical whitespace and Unicode code units. `Performance paths` must be a non-empty unique JSON array of canonical path IDs. Do not record command arguments, changed-file inventory, executed checks, reports, or measurements; the protected planner and receipt own that machine evidence. Each localized complaint or post-clarification targeted choice authorizes one bounded iteration; after it passes, return the app and wait for user evaluation. Classifier output or complaint evidence alone never supplies path localization or authorizes full certification. The separate operator command is permitted only after the user explicitly requests a complete audit or explicitly accepts the agent's offer; the user does not need to name the command.

## Decision Trail

### Iteration 1 — Device mockup renderer ported from the reference app

- Request: Rebuild the 3D mockup application at `3d-mockup-project` using Toolcraft, supporting all five bundled device models through a device picker, porting and adapting the existing implementation rather than re-authoring it.
- Task type: Reference app port, schema and controls, custom renderer, canvas output, image export, acceptance, and performance.
- User-visible result: A screenshot dropped into the panel appears on the selected device's display. Five devices are selectable (iPhone 17 Pro Max, MacBook, iMac, Mac Studio, Apple Watch Ultra); each loads its own model, reframes the camera around its own bounds, and keeps the screenshot on its own screen. Fit mode, scale, position and stretch place the image inside the display. Four captured studio environments relight the scene, focal length changes perspective, dragging the device rotates it while dragging the background pans, the ground plane can be turned off, and Export PNG downloads the framed result.
- Source/reference checked: `https://github.com/ibrahimweng/3d-mockup-project` at commit c2b67e6, cloned and run locally. Read `src/app/app-schema.ts`, `app-composition.tsx`, `product-domain.ts`, `preview.tsx`, `export-renderer.ts`, `artwork-store.ts` and all of `src/app/render`. Inspected every GLB in `public/models` with `@gltf-transform` to record its scenes, emissive display material and screen geometry. The deployed build at `3d-mockup-project-main.vercel.app` is unreachable from this environment because the network policy denies `vercel.app`, so the repository at that commit is the reference.
- Reference inputs: None. The reference is a running application and its source, not a motion recording, so `referenceInputs` is the empty no-reference fast path.
- Docs/contracts read: `workflow.md`, `core/reference-study.md`, `core/runtime-boundary.md`, `assembly-workflow.md`, `core/control-selection.md`, `core/layout.md`, `core/performance.md`, `core/setup-export.md`, `core/media-upload.md`, `schema-reference.md`, `decision-contract.md`, `component-rules.md`, `renderer-technique.md`, and `performance.md`.
- Contract rules applied: `runtime-shell-required`, `canvas-no-app-ui`, `canvas-surface-preserved`, `infinity-canvas-scene-bounds`, `interaction-surface-ownership`, `controls-product-coverage`, `controls-section-inventory-required`, `controls-component-layout-invariants`, `output-export-required`, `renderer-technique-inventory`, `renderer-view-interaction`, `reference-clone-source-of-truth`, `acceptance-product-observable`, `performance-coverage-levels`, and `persistence-policy-explicit`.
- View interaction intent: `orbit`. The product is a visible editable three-dimensional scene, and `camera.orbit` is the single `orientationGizmo` target consumed by preview, hit testing, gizmo drag, history, reset and export.
- Interaction ownership: Canvas owns direct spatial rotation of the device, evidenced by the reference binding `useToolcraftModelOrbitInteraction` with a geometry hit test; a drag that misses the device falls through to viewport pan. The panel owns screen placement as a global property edit, because the reference authors position and stretch through Vector pads while primary drag stays with rotation.
- Decision: Keep the reference runtime as the source of truth — one WebGL raster pass under a PMREM-convolved environment, no accumulator and no convergence — and generalize its single hard-coded iPhone scene into a device catalog. Everything that differs between models is data (`modelFile`, `sceneName`, `screenMaterial`, `excludedNodes`, `screenAspect`, `screenFlip`, `yawDegrees`) rather than a branch in the scene builder, because three of the five files are multi-scene and each authors its display differently.
- Alternatives rejected: A path-traced renderer, because every camera move would restart a convergence that holds the GPU at load. Canvas 2D and SVG, because neither can evaluate image-based lighting. `imagePicker` for the device control, because the repository ships no device thumbnails and five identical placeholder tiles are less useful than named rows. `segmented` for the device control, because five options with 63 label characters exceed its 4-option, 24-character budget. Runtime model presentation through a model `fileDrop`, because the devices are bundled scene geometry rather than user-uploaded source material and `media.defaultAssets` accepts only base64 data URLs, which is not viable for 139MB of models.
- State/output mapping: `device.model`, `studio.environment` and `export.includeBackground` feed `readRasterSettings` and rebuild the scene through `buildDeviceScene`. `artwork.image` media feeds the display texture through `createScreenTexture`. `artwork.fit`, `artwork.scale`, `artwork.offset` and `artwork.stretch` feed `readScreenTransform` and rewrite the display texture's repeat and offset only. `camera.orbit` and `camera.focalLength` feed `RasterRenderer.setPose`. `scene.background` colours the ground material. Preview and export read the same two functions, so the exported frame is the frame the preview shows.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: `macstudio.glb` was 96MB, so first selection of Studio Display is slow. `iphone-5.glb` contains the same phone geometry as the 17 Pro Max, so those two options look alike. Lighting is image-based, so shadows come from one directional map and reflections sample only the environment.

## Decisions

### Renderer

- Decision: One WebGL raster pass over a GLB device model lit entirely by a PMREM-convolved HDR environment, with the model, scene, screen material and framing selected from a device catalog.
- Reason: The reference runtime is the source of truth for this clone, and its whole point is that a camera move costs one draw call instead of restarting a convergence.
- Evidence: `src/app/render/device-scene.ts` and `render/raster-renderer.ts`; `rendererTechnique` and `rendererPipeline` in `src/app/app-performance.ts` and `render/pipeline.ts`.

### View Interaction

- Decision: `orbit`, with `camera.orbit` as the single orientation target.
- Reason: The product is a visible editable three-dimensional scene and the reference lets the user rotate the device by dragging it.
- Evidence: `appProductReadiness.viewInteraction` in `src/app/app-acceptance-data.ts`; the `orientationGizmo` control in the Camera section; `useToolcraftModelOrbitInteraction` in `src/app/preview.tsx`.

### Interaction Ownership

- Decision: Canvas owns rotating the device; the panel owns placing the screenshot inside the display.
- Reason: Rotation is spatial and wants direct correspondence; placement wants exact repeatable values and would otherwise fight the pointer with rotation.
- Evidence: `appProductReadiness.interactionOwnership` entries `camera-orbit` and `screen-placement`; `RasterRenderer.hitTest` leaves a miss to `CanvasShell` pan.

### Timeline

- Decision: No timeline.
- Reason: Nothing in the product animates; the reference has no playback, keyframes, or transport.
- Evidence: `panels.timeline` is omitted and `animationIntent` is `{ mode: "none" }`.

### Layers

- Decision: No layers.
- Reason: One device and one screenshot are rendered at a time, so there is no multi-object selection, visibility, or reorder workflow.
- Evidence: `panels.layers` is omitted.

### Controls

- Decision: Six product sections — Device, Screenshot, Screen fit, Studio, Camera and Image Export — plus the authored Background pair the runtime relocates into Setup.
- Reason: Entity-first grouping, split only where the runtime's own layout rules require it: FileDrop and Vector are standalone-layout controls and Segmented and Slider are grouped, so one mixed section would be split into unlabelled fragments.
- Evidence: `appControlSectionInventory` in `src/app/app-acceptance-data.ts`; the section assertion in `src/app/app-schema.test.ts`.

### Export

- Decision: Image export only, through one `export-image` panel action and an `Image Export` settings section.
- Reason: The reference delivers a single PNG artifact, and neither SVG nor video was requested.
- Evidence: `productReadiness.exportIntent`; `src/app/export-renderer.ts` draws the same frame the preview shows through the shared `readRasterSettings`.

### Performance

- Decision: No workload dimensions, and one scenario per derived renderer path.
- Reason: No control makes a frame more expensive. Device selection changes which model is decoded, but that is a one-off scene build rather than a per-frame magnitude, and the raster pass is constant-cost for every device.
- Evidence: `workloadEnvelope: { dimensions: [] }` and the scenarios derived from `deriveToolcraftPerformancePaths` in `src/app/app-performance.ts`.

## Evidence

- Source reviewed: `src/app/app-schema.ts`, `app-composition.tsx`, `product-domain.ts`, `preview.tsx`, `export-renderer.ts`, `artwork-store.ts` and all of `src/app/render` in the reference repository at commit c2b67e6.
- Contract applied: `reference-clone-source-of-truth`, `renderer-technique-inventory`, `renderer-view-interaction`, `interaction-surface-ownership`, `controls-section-inventory-required`, `output-export-required`, and `acceptance-product-observable`.
- Evidence: The reference was cloned, installed and built (`npm install`, `npm run build`), then served locally and driven in Chromium; its behaviour was observed directly rather than inferred from source alone.
- Source reviewed: All five GLB files were inspected with `@gltf-transform` to record their scenes, emissive display materials and screen geometry. `macbook.glb` holds an iPhone, an iMac and the MacBook in sibling scenes, and `macstudio.glb`'s default scene stacks two displays, so both declare an explicit `sceneName`.
- Evidence: The rebuilt app was driven in Chromium across all five device options with a screenshot applied; each option loaded its own model and displayed the screenshot on its own screen with no page errors.

### Model repair

- Decision: `materialCorrections` on `DeviceDefinition`, applied before any colourway and captured as the model's Natural state.
- Reason: The Studio Display rendered as a bright rim around a void. All seven of its materials are fully metallic and two are pure black; a metal has no diffuse response, so a flat black metal panel returns nothing at any angle and no environment or light can rescue it. The phones read correctly because their authors left most of the shell dielectric. This is a defect in the file rather than a preference, so it is repaired rather than expressed as a finish.
- Evidence: `materialCorrections` in `src/app/product-domain.ts` and `applyMaterialCorrections` in `src/app/render/device-scene.ts`; every material was identified first by tinting each one separately and rendering, which established that the stand neck is `metal.010` and only the foot is `metal2.002`.

### Screen fit

- Decision: `applyScreenTransform` converts the panel's aspect to width-over-height before comparing it with the image's.
- Reason: `measureScreenAspect` returns height over width and an image is measured width over height, so the ratio between them was wrong by the square of the panel's aspect and every design was cropped far tighter than its proportions called for.
- Evidence: `screenRatio` in `src/app/render/device-scene.ts`; a corner-labelled design now fills a matched panel exactly instead of showing a fifth of its width.

### Scene selection

- Decision: `findScene` matches a catalog `sceneName` against both the file's own name and three.js's sanitised form.
- Reason: The loader strips the characters its animation paths reserve, `.` among them, so a Blender file naming its scenes `Scene.001` and `Scene.002` arrives as `Scene001` and `Scene002`. A plain comparison never matched, and the miss fell through to the default scene — which for `macbook.glb` happens to be the MacBook, so that device appeared to work while the mechanism behind it did not.
- Evidence: `sanitizeSceneName` and `findScene` in `src/app/render/device-scene.ts`; `PropertyBinding.sanitizeNodeName` in three.js is `name.replace(/\s/g, "_").replace(/[[\]./:]/g, "")`.

### iMac

- Decision: Added as a sixth device, reading `Scene.001` out of the `macbook.glb` already shipped.
- Reason: Asked to "check the imac". No iMac was selectable, but one is modelled in a scene the app never loaded, so the model was there and only the catalog entry was missing. It costs no new asset and no new code — the two devices share one download and the second is served from the model cache.
- Evidence: The `imac` entry in `src/app/product-domain.ts`. Its yaw was measured rather than guessed: the display's world normal points along +X where the camera looks down +Z, hence `yawDegrees: -90`. Driving all six devices in Chromium fetches five GLBs, because the iMac hits the MacBook's.

### Printed panels

- Decision: `repaintedMaterials` names body materials whose base texture a colourway sets aside, so the colour lands flat; Natural puts the texture back.
- Reason: The phone's back panel carries its orange in a base-colour texture, and a colourway writes base colour alone, which multiplies. Painting the panel silver therefore produced a paler orange rather than silver, leaving one orange card on an otherwise repainted phone. Tinting is still right where the texture is neutral — the Studio Display's brushed aluminium keeps its grain — so this is opt-in per material rather than a change to how finishes work.
- Evidence: `PHONE_PRINTED_PANELS` in `src/app/product-domain.ts` and the `repainted` branch of `applyFinish`. The two materials were found by measuring texture means rather than base colours, which is why an earlier sweep for red base colours missed them: one of them, `SMUhrjUPCjJkPUK`, differs from a material already in the list only by a `.001` suffix.

### Pointer model

- Decision: A plain primary drag rotates the device wherever it starts, the display still claims that drag for the design, and the middle button moves the board.
- Reason: Requiring the pointer to find the object before it can rotate is what makes a 3D viewer feel fiddly, and the space beside the device is the natural place to grab. Panning is a view action, so it moves to the view button; two fingers already pan, because a trackpad swipe arrives as a wheel event the runtime turns into a canvas offset.
- Evidence: `claimsOrbit` in `src/app/view-orbit.ts`, `src/app/view-pan.ts`, and the priority chain in `src/app/preview.tsx`. Driven in Chromium: a primary drag on empty canvas turns the phone from front to profile, a middle drag moves the board without changing the pose, and a primary drag on the display still moves the design with the device held still.

### Preview resolution

- Decision: The preview draws at `min(devicePixelRatio, renderScale)` device pixels per CSS pixel, capped at 2, and drops to 0.6 of that while a gesture is in flight.
- Reason: It drew at `devicePixelRatio * renderScale`, which on a retina display is four device pixels per CSS pixel — sixteen times the pixel count of the box it is shown in. Measured: a 1080x1350 preview was rendering 4320x5400, 23.3 megapixels a frame, nearly three times a 4K frame, to fill 1.46 megapixels of screen. None of it was visible, because a display cannot show more than its own ratio, and none of it reached the export either: `export-renderer.ts` builds its own renderer at the requested size with a pixel ratio of 1.
- Evidence: `pixelRatio` in `src/app/preview.tsx`. Measured in Chromium at `deviceScaleFactor: 2` — 23.33 MP before, 5.83 MP idle after, 2.10 MP mid-drag, restored on release. The same 25-move orbit took 157s before and 35s after under software rendering.

### Shadow updates

- Decision: `shadowMap.autoUpdate` is off; the depth map is redrawn only when the scene is rebuilt or a live setting changes.
- Reason: The shadow depends on the light and the object, and an orbit moves neither — only the camera. On automatic, three.js redrew the whole scene into a 2048-square depth map every frame, so rotating cost two full passes instead of one. Measured as 64 draw calls per frame before and 37 after.
- Evidence: `invalidateShadow` in `src/app/render/raster-renderer.ts` and its call sites.

### Live settings guard

- Decision: `applyLiveSettings` keeps its own key and returns early when nothing it owns has changed.
- Reason: The settings object is rebuilt on every store change, and during a drag that is every pointer move, so a rotation was repainting every material in the model, replacing the whole light rig and rebuilding the ground sixty times a second. None of it had changed.
- Evidence: `lastLiveKey` in `src/app/render/raster-renderer.ts`.

### Adaptive resolution

- Decision: Frames are timed during a drag and the preview's pixel ratio moves toward whatever the machine can hold, between full and 0.75.
- Reason: A fixed resolution has to be chosen for hardware nobody knows in advance. Two rounds of fixed reductions did not resolve the report, and this environment cannot reproduce it: it renders through SwiftShader, draws roughly one frame every five seconds under load, and floors every per-device measurement at the same 33ms, so no fixed number chosen here can be trusted to suit a real GPU. Letting the running machine choose removes the guess.
- Evidence: `foldFrameGap` in `src/app/adaptive-quality.ts` is a pure function over frame gaps, verified in `adaptive-quality.test.ts` against synthetic timings — it converges to the floor under sustained slowness, climbs back to full when frames come in fast, ignores a single hitch, and discards gaps long enough to be a paused hand. Convergence is proven by test rather than in a browser, because a browser slow enough to need it is too slow to demonstrate it.

### Pointer coalescing

- Decision: The orbit, pan and design drags accumulate pointer movement and write to the store once per animation frame instead of once per event.
- Reason: A pointer reports far more often than the screen refreshes, and every write re-renders the whole app and re-runs every effect behind it. Only the last position before a frame is drawn can be seen, so the rest is work whose result is discarded. The design drag was worst because it also raycast the display on every event. The runtime's own model orbit already batches this way, which is what pointed at the omission.
- Evidence: `flush` in `src/app/view-orbit.ts`, `view-pan.ts` and `design-drag.ts`. Measured in Chromium by pumping pointer events at 250Hz for three seconds during a design drag: the page processed 10 of them before and 633 to 660 after, reproducibly — 300ms of main-thread work per event against 4.6ms. The orbit path has no raycast, so the same measurement on it is inside this environment's noise; the change rests on the mechanism and on the runtime's own precedent rather than on a measured figure.

### Supplied model intake

- Decision: `scripts/clean-model.mjs` prepares a supplied GLB for the catalog, and `mac-studio.glb` is its first output.
- Reason: A replacement Mac Studio arrived at 3.5MB, which flattered it: that was Draco over 502,646 triangles, and 34.8MB once decoded. The app loads with a plain `GLTFLoader` and no decoder, so the compression had to come off regardless, at which point the geometry had to come down with it. Two further faults were only visible once opened — the file carried a second scene built around a 22-metre studio backdrop, and the display was unwrapped into a corner of a shared atlas, u from 0.02 to 0.45, which is fine for a baked wallpaper and useless for a design supplied at runtime.
- Evidence: `scripts/clean-model.mjs` drops the unused scene, removes Draco, welds, simplifies under an error bound rather than a flat ratio, rebuilds the display's unwrap from its geometry, and quantizes. 502,646 triangles to 105,046 at 2.43MB, against 22MB for the model it replaces. Driven in Chromium across all five devices: the design fills the panel the right way up, Natural and Graphite both read correctly, no page errors.
- Risk: The step that rebuilds the unwrap assumes the display is a flat panel, which is true of every model in this set. A screen modelled with curvature would need a real projection rather than two axes.

### Sharpness

- Decision: Export honours the pixel ratio it is handed, screen textures request maximum anisotropy, and the preview holds full resolution until frames are measurably late.
- Reason: Reported as renders looking overly compressed and blurred, which matters because the output is for professional use. Three separate losses. The runtime scales the export context by a pixel ratio and passes that ratio to the product renderer; ours ignored it and rendered at CSS size, so `drawImage` upscaled every export. No anisotropy was set anywhere, so a foreshortened panel sampled a mip chosen for its narrowest axis. And the preview dropped a flat 0.6 on every drag whether or not the machine needed it.
- Evidence: `mockupExportRenderer` in `src/app/export-renderer.ts`, `createScreenTexture` in `render/screen-texture.ts`, `pixelRatio` in `preview.tsx`. Measured on a 3277x4096 export of a one-pixel grid: edge energy per pixel 6.98 before, 13.61 after, a 1.95x gain that matches the ratio being restored.

### Taking a supplied model as it is

- Decision: A supplied GLB ships byte for byte and is repaired at load. `creaseAngleDegrees` and `screenUnwrap` join `sceneName` as catalog entries; a Draco decoder is wired into the loader.
- Reason: Simplifying the Mac Studio to 105k triangles introduced visible artifacts, and the request was to keep the supplied file. Its own faults are repairable without touching it: flat panels welded to their bevels, which washed a soft fan across the machine's lid and the display's back, and a display unwrapped into an atlas corner.
- Evidence: `creaseNormals` and `unwrapScreen` in `render/device-scene.ts`; `md5sum` matches the upload. Verified in Chromium from four angles: the fan across the display back is gone and the machine reads as a crisp aluminium block with a defined vent grille.
- Risk: Splitting normals de-indexes the geometry, so the model carries more vertices than one authored with proper smoothing groups. The file also holds a second scene the loader parses and never draws.

### Surfaces

- Decision: The Surface control offers Concrete and Oak rather than a generic Table, each carrying its own tiling maps and its own bounce light, declared together in `src/app/surfaces.ts`.
- Reason: The request was that switching surface should be legible in the light, not only in the texture — "the light in the entire scene need to communicate this". A material that only changes the pixels under the device reads as a decal: the right grain in the right place with none of the consequences of being there. Light landing on a table scatters back up into every downward-facing face of the subject, coloured by whatever it hit, and that is the one direction a three-point rig has no light in, so nothing already in the scene can stand in for it.
- Evidence: `SURFACE_DEFINITIONS` in `src/app/surfaces.ts` pairs each material with a bounce colour and a share of the key; `bounce` in `render/device-scene.ts` is a non-casting directional light aimed from below along the key's mirrored direction, its intensity a fraction of the key so dimming the key dims the bounce. Measured in Chromium on the MacBook's aluminium base under Hard light, same crop, everything else identical: warmth (R−B) is 2.96 with no surface, 3.17 on concrete, 8.01 on oak — a neutral slab stays neutral and a pale board warms the subject by 2.7x, at effectively unchanged exposure (mean 105.5 against 105.7).
- Decision: The maps are synthesised by `scripts/make-surface-textures.mjs` rather than photographed.
- Reason: Every texture library is unreachable from this environment; each returns 403 on CONNECT. Stated rather than hidden, because "shipped texture maps" ought to mean something specific. What they are is real — tiling albedo, normal and roughness built from a shared height field, so the relief and the colour agree about where the surface is high and low. What they are not is a scan of a particular slab. Replacing them later is six files and nothing else.
- Evidence: 900KB for the set. The noise lattice is periodic and the normal is taken with wrapped neighbours, so a tile meets its own opposite edge without a seam. Three passes of tuning against rendered frames rather than against the maps: concrete went from cloudy to speckled to even before it read as a poured slab, and oak needed an asymmetric ring profile — slow darkening into latewood, then a hard edge back to next spring — because a sharpened cosine gives symmetrical ridges that read as corrugated card.
- Decision: `createSurfaceGeometry` runs V along the profile by distance walked rather than by depth.
- Reason: Two of the four profile points sit at the same depth, so a V taken from depth handed the entire front face one value, and any map on it arrived as a single row of pixels smeared down the front of the table.
- Risk: The tile count is fixed per material while the table is sized against the device, so texel scale varies about threefold across the three devices a table is offered for. Tuned against the MacBook. A fourth device far outside that range would want a physical size in the catalog rather than a repeat count.
- Risk: The acceptance row `surface.kind.material` names an automated test and a browser test that do not exist. That is true of every product row in this file's acceptance data — the e2e suite covers the Toolcraft harness and not this product — so it is a standing gap rather than one this change opened.

### Staging

- Decision: The backdrop is a surface of revolution sized to contain the camera, and the scene carries a real background colour whenever the backdrop is on.
- Reason: Reported as the backdrop cutting rather than flowing around the scene. Two separate causes. The paper was an extruded strip with two ends, found the moment anyone orbited; and the renderer is built with `alpha: true`, so everywhere the set's geometry did not reach — above the paper, past the floor's rim, out at the sides — the canvas was simply see-through and what showed was the page behind it. A set that ends in a hole is not a set.
- Evidence: `createSweepGeometry` in `render/device-scene.ts` sweeps the cove profile through a full turn; `coveRadius` reads the framing distance off the camera it was placed with and quantises it, so a two-hundred-millimetre lens standing the camera four times further back gets a set four times larger rather than a view of the outside of the wall. `applyBackground` sets `scene.background` when the backdrop is showing and clears it for a transparent export. The floor's rim fade now only dissolves when there is no cove for it to meet, and the plane grew to `FLOOR_HALF_EXTENT` so it always arrives at the foot of one.
- Risk: The wash lamp's intensity is now derived from the cove's distance rather than fixed, because inverse-square over a set that can quadruple in size would otherwise lose the graduation entirely on a long lens.

### Furniture

- Decision: A surface is a piece of furniture standing on a floor: a chamfered top turned sixteen degrees off square, legs on the three large devices, a slab on the two small ones, and the room's floor dropping by the height of it.
- Reason: The previous table was a plinth — full width, running out of every side of frame, with the floor hidden behind it. That reads as a change of floor rather than as an object, and it cannot be photographed from below at all. What separates furniture from ground is that you can get under it: legs, an underside, and the backdrop carrying on behind them.
- Evidence: `DeviceSurface` is now measured from the device in four directions rather than symmetrically, so the device sits near one corner with two short edges reading and the top continuing out of frame behind and to the right. `floorY` in `render/device-scene.ts` drops by `surface.stand` when a table appears — the device has not moved, it is standing on the top and the top is where its feet already were — and the floor, the foot of the cove and the wash lamp all hang off it. The top casts a shadow now, which it could not when it was a plinth pressed against the paper. Driven in Chromium across all five devices and both materials, and orbited below the tabletop: the underside is closed, the legs shade, and the device is correctly occluded by its own table.
- Decision: Legs are a separate mesh in dark satin metal at 0.45 metalness.
- Reason: A stone slab on stone stilts is a plinth and an oak top on oak posts is a farmhouse table. More practically, merged into the top they would have worn a tiling map at a scale chosen for a surface a hundred times their width. The first attempt at 0.85 metalness over a near-black base came out as a flat silhouette — metals have no diffuse response, so under a low environment there was nothing left to shade the corners with.

### Stone

- Decision: The concrete maps are replaced by honed veined limestone, and the option is called Stone.
- Reason: Asked for natural stone rather than a manufactured surface. The two are built the other way up from each other: a pour is homogeneous by construction, so its character is small and even, while a bed of limestone was laid down over an age and cut across, so its character is large — broad tonal drift and veins that run somewhere.
- Evidence: `stone()` in `scripts/make-surface-textures.mjs`. The veins come from bending a coordinate that runs across the slab and taking where it crosses a whole number, warped by well under one spacing — bending it further folds the sheets back through each other into closed rings, which reads as camouflage rather than as bedding seen in section. Voids are sparse rather than a field, because at the density the first pass used it read as sandstone.

## Verification

- `npm run typecheck` passes.
- `npm run build` produces a production bundle.
- The product acceptance, schema, layout, reference-clone and performance validators pass under `vitest run src`.
- First product delivery still requires one bare `npm run verify:delivery`; measured performance has not been run.

## Risks

- Risk: `macstudio.glb` was 96MB; its three 4096-square PNGs were re-encoded as 2048 JPEG to bring it to 21MB, verified as visually identical. Parsed models and convolved environments are now cached for the life of the page, so each is paid for once — returning to a device already seen issues no request at all.
- Risk: `canvas.renderScale` now reads as a ceiling on the display's pixel ratio rather than a multiplier on top of it. On a 1x display the control has no effect, because there is nothing to cap.
- Risk: `src/app/render/device-scene.ts` imports `GLTFLoader` and `RGBELoader`, which the product boundary checker rejects. The reference app has the same violation, and the runtime's sanctioned alternative — a model `fileDrop` with runtime presentation — cannot express bundled device geometry or HDR environments.
