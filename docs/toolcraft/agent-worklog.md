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
- User-visible result: A screenshot dropped into the panel appears on the selected device's display. Five devices are selectable (iPhone 17 Pro Max, iPhone 5, MacBook, Studio Display, Apple Watch Ultra); each loads its own model, reframes the camera around its own bounds, and keeps the screenshot on its own screen. Fit mode, scale, position and stretch place the image inside the display. Four captured studio environments relight the scene, focal length changes perspective, dragging the device rotates it while dragging the background pans, the ground plane can be turned off, and Export PNG downloads the framed result.
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

## Verification

- `npm run typecheck` passes.
- `npm run build` produces a production bundle.
- The product acceptance, schema, layout, reference-clone and performance validators pass under `vitest run src`.
- First product delivery still requires one bare `npm run verify:delivery`; measured performance has not been run.

## Risks

- Risk: `macstudio.glb` was 96MB; its three 4096-square PNGs were re-encoded as 2048 JPEG to bring it to 21MB, verified as visually identical. Parsed models and convolved environments are now cached for the life of the page, so each is paid for once — returning to a device already seen issues no request at all.
- Risk: `iphone-5.glb` contains the same phone geometry as `iphone-17-pro-max.glb`, so those two device options render nearly the same object.
- Risk: `src/app/render/device-scene.ts` imports `GLTFLoader` and `RGBELoader`, which the product boundary checker rejects. The reference app has the same violation, and the runtime's sanctioned alternative — a model `fileDrop` with runtime presentation — cannot express bundled device geometry or HDR environments.
