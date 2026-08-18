# Implementation Worklog

This file records product decisions and the evidence behind them. Keep it short, factual, and current. Update it after schema, renderer, timeline, layer, export, performance, or acceptance decisions.

## Status

Mode: product

Clawscale is an AI image upscaler: upload a photo, run a Real-ESRGAN upscale entirely in the browser at no cost, compare original and result, and export the outcome.

## Automatic Delivery Lifecycle

Keep this worklog human-shaped. For the first product delivery, record the request, decisions, state/output mapping, reference evidence, rejected alternatives, and known risks; one bare `npm run verify:delivery` derives complete contract proof, one build, full functional acceptance, and no measured performance. For later `functional-targeted` delivery, record only the new intent and decisions; the same bare command derives exact ownership-required proof from protected state.

Classifier output establishes complaint authority only and never path localization. A localized performance complaint adds the domain authority below, then one bare `npm run verify:delivery` runs one targeted iteration. If localization remains unresolved regardless of classifier result, ask one user-facing question naming visible operations and offering targeted diagnosis or a complete review; record neither `performance-iteration` intent nor canonical path authority until the answer supplies exact localization evidence. Never ask the user to choose internal path IDs. A broad or honestly unlocalizable problem may present that single choice with a recommendation for complete review, but the user still chooses. A direct complete-review request needs no further clarification. The full audit remains separate and requires an explicit operator request or accepted offer before `npm run verify:perf` may run. Protected receipts own changed files, plans, checks, reports, measurements, and pass/fail evidence.

## Performance Iteration Entry Contract

For high-confidence ordinary work, record `Performance intent: ordinary-product-work`. For unresolved localization, whether classification returned high-confidence `performance-iteration` or `needs-agent-judgment`, record the unresolved visible operation but no `Performance intent: performance-iteration` field or `Performance paths` until the user's one clarification provides exact localization. For a localized performance complaint or post-clarification targeted choice, record exactly the domain fields described by the local workflow contract in the latest iteration.

## Decision Trail

### Iteration 1 — Clawscale AI image upscaler

- Request: Build a web tool that upscales images using AI, powered by the EachLabs Real-ESRGAN API (the same engine used by OpenClaw's upscaling skill), with the Toolcraft canvas/panel interface, and deployable to Vercel with a serverless key-holding proxy.
- Task type: App assembly, schema/controls, media upload, export, and generated-app first product delivery.
- User-visible result: Upload a photo in the Source Image uploader, pick a 2×/4×/8× scale factor and optional face enhancement, click the sticky Upscale action to run the AI upscale with live progress, compare original and result on the canvas as Original/Split/Result views with an adjustable split position, tune the backdrop, and export the outcome as PNG/JPG at 2K/4K/8K.
- Source/reference checked: The EachLabs API OpenAPI spec (`/v1/upload/presign`, `/v1/prediction`, `/v1/prediction/{id}`, `real-esrgan` input schema `{image, scale, face_enhance}`), toolcraft.sh starter structure, and the local `/api` serverless proxy plus `server/dev-api.mjs` mock used for deterministic offline runs.
- Reference inputs: None (no Figma, video, or reference app; behavior assembled from the user's request and the EachLabs API contract).
- Docs/contracts read: `workflow.md`, `core/runtime-boundary.md`, `assembly-workflow.md`, `core/control-selection.md`, `core/layout.md`, `core/media-upload.md`, `core/setup-export.md`, `schema-reference.md`, `component-rules.md`, `decision-contract.md`, `acceptance-testing.md`.
- Contract rules applied: `runtime-shell-required`, `canvas-no-app-ui`, `canvas-surface-preserved`, `interaction-surface-ownership`, `controls-product-coverage`, `output-export-required`, `controls-section-inventory-required`, `controls-component-layout-invariants`, `acceptance-product-observable`, `persistence-policy-explicit`, `infinity-canvas-scene-bounds`.
- View interaction intent: `non-spatial` — the product shows flat photos and their upscaled results; there is no 3D scene or model, so no orbit or orientation gizmo applies.
- Interaction ownership: The panel owns every operation. `comparison-split-position` (comparison.split, property-edit, usability-analysis) chose the panel slider because a draggable canvas divider would mirror the same operation with duplicate chrome over the compared photos; no canvas interactions exist.
- Decision: Keep all state in runtime schema targets (`source.image` media, `upscale.scale`, `upscale.faceEnhance`, `comparison.view`, `comparison.split`, `export.includeBackground`, `appearance.background`, image-export settings). The upscale runs in `onPanelAction` with the real Promise driving the sticky-footer progress accent; the result is written to the non-persisted `result.info` value target and its bytes cached module-side (data URL for the DOM preview, ImageBitmap for export drawing). `canvasContent` renders only product output (the photos, split clip, and divider overlay); `renderDefaultCanvasMedia` is false because the product preview replaces the generic image layer. `exportRenderer` draws the same deterministic comparison frame in scene coordinates for runtime-owned PNG/JPG export, and `sceneBoundsProvider` reports the source photo's world frame for infinite-mode export.
- Alternatives rejected: OpenClaw as the runtime backend (it is an assistant gateway whose upscaling skill itself wraps the EachLabs API — the web tool calls the engine directly and the OpenClaw skill ships alongside); a canvas drag divider (duplicate surface of the panel slider); Real-ESRGAN in the browser via ONNX (too heavy for a deployed tool); persisting result bytes into runtime media (the result is a derived artifact, re-creatable from its remote URL, and must not masquerade as source material); a custom WebGL/Canvas2D live renderer (DOM `img` composition is sufficient and keeps the performance envelope empty).
- State/output mapping: `source.image` media assets render as the original layer (cover/crop, consuming runtime `transform` rotate/flip metadata) in preview and export; `upscale.scale`/`upscale.faceEnhance` become the `real-esrgan` request parameters and determine the result dimensions/pixels stored in `result.info`; `comparison.view` and `comparison.split` select and clip the visible layers in both the live preview and the exported frame; the Background pair drives the preview backdrop and export transparency through `shouldIncludeToolcraftPreviewBackground` and runtime export composition; `export.image.format`/`export.image.resolution` select the runtime-encoded artifact.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: The deployed EachLabs CDN may not serve CORS headers, in which case the result is fetched through the `/api/result` same-origin proxy (capped at 4 MB) — very large results would preview via direct URL only. Browser acceptance runs against the local mock API (`server/dev-api.mjs` without `EACHLABS_API_KEY`), which produces deterministic scaled output; live-API behavior differs only in pixels, not in flow. The upstream template ships one failing signed framework self-test (`scripts/toolcraft-product-control-boundary.test.mjs`, control-classification ordering), reproduced in a pristine scaffold and not fixable in product code.

### Iteration 2 — Free in-browser engine replaces the paid API

- Request: "you remember i told you i only want free services that don require billing ? i do not want to pay for anything"
- Task type: Renderer/engine replacement, schema and controls change, acceptance update.
- User-visible result: Upscaling now runs on the user's own machine. The Upscale action loads a 4.6 MB Real-ESRGAN model and runs it through ONNX Runtime Web; there is no API key, no account, and no cost. Scale factors are 2x and 4x (the model is natively 4x), and the removed face-enhancement switch is replaced by an AI strength slider that blends the model output over a plain enlargement.
- Source/reference checked: the `realesr-general-x4v3` ONNX model published on Hugging Face (BSD-3-Clause Real-ESRGAN weights), the `onnxruntime-web` 1.27 package entries, and empirical browser runs through Playwright.
- Reference inputs: None.
- Docs/contracts read: `core/runtime-boundary.md`, `core/control-selection.md`, `core/setup-export.md`, `acceptance-testing.md`, `decision-contract.md`.
- Contract rules applied: `runtime-shell-required`, `canvas-no-app-ui`, `controls-product-coverage`, `controls-section-inventory-required`, `output-export-required`, `acceptance-product-observable`.
- View interaction intent: unchanged `non-spatial`; the product still shows flat photos.
- Interaction ownership: unchanged; every operation stays in the panel, with `comparison-split-position` the one declared entry.
- Decision: Run inference in the product module itself, on the main thread, tiled at 128px with 8px overlap and a yield between tiles so the sticky-footer progress keeps painting. Import the CPU entry `onnxruntime-web/wasm` statically and serve its `.wasm` from `public/ort/`. Cap source images at 1024px on the long edge so a CPU run stays bounded.
- Alternatives rejected: the EachLabs hosted API (needs billing, which the user has ruled out); a Web Worker (a `new Worker(new URL(...))` reference is not a static import edge, so the module is rejected as orphaned by the product boundary); the WebGPU/jsep runtime (much faster, but it needs a loader `.mjs` sidecar, and any JavaScript file placed in `public/` is classified as an unreachable product module); `?url` imports of the package's wasm (Vite rewrites them into a JS shim and the runtime fails with "$b is not a function"); a runtime `import()` of a `public/` copy of the runtime (Vite appends `?import` and 500s in dev).
- State/output mapping: `upscale.scale` and `upscale.strength` are read when the sticky Upscale action runs; the produced blob is cached in the module-level result store and its id recorded in the non-persisted `result.info` value, which the preview and `exportRenderer` both consume.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: CPU inference is slow for large photos, hence the 1024px cap and the documented expectation. Results live in memory for the session only, so a reload shows the source image alone until the user upscales again.

### Iteration 3 — Web-only scope: local companion removed

- Request: "i do not want open claw to run on my mac, everything we are building has to only run on the web"
- Task type: Scope correction and cleanup; no change to the shipped web app.
- User-visible result: Nothing changes in the browser tool. The local companion pieces are gone: the OpenClaw skill, the `cli/upscale.mjs` script, and the `onnxruntime-node`/`sharp` native dependencies were removed, and the staged `~/.openclaw` skills folder was deleted. OpenClaw itself was never installed or run on the machine.
- Source/reference checked: the removed `cli/` and `openclaw-skill/` folders and the project dependency list.
- Reference inputs: None.
- Docs/contracts read: `acceptance-testing.md`, `decision-contract.md`.
- Contract rules applied: `workflow-required`, `acceptance-product-observable`.
- View interaction intent: unchanged `non-spatial`.
- Interaction ownership: unchanged.
- Decision: The deployed browser app is the entire product. Anything that would run as a local process on the user's machine is out of scope, so no CLI, gateway, or assistant integration ships with it.
- Alternatives rejected: keeping the CLI as an unused convenience (it contradicts the web-only scope and would rot untested); documenting it as optional (same problem, plus it implies a supported path).
- State/output mapping: unchanged — the schema, preview, export renderer, and acceptance rows are untouched by this cleanup.
- Performance intent: ordinary-product-work
- Verification: One bare `npm run verify:delivery` will derive and run the protected proof.
- Risks: None: the removed files were not imported by any product module, and the browser engine that replaced them is covered by the existing acceptance rows.

## Decisions

- Engine: Real-ESRGAN `realesr-general-x4v3` executed in the browser through ONNX Runtime Web. No backend, no key, no cost, and nothing installed on the user's machine.
- UI: Toolcraft runtime shell only — schema controls, sticky panel actions, DOM product preview in `canvasContent`, runtime-owned export through `exportRenderer`.
- Result handling: `result.info` value target plus module-side byte caches; the result is a derived artifact, not runtime media.
- Delivery: image-only export intent; the Upscale action reports real async progress.

## Evidence

- Source reviewed: `src/app/app-schema.ts`, `src/app/app-composition.tsx`, `src/app/preview.tsx`, `src/app/export-renderer.ts`, `src/app/app-actions.ts`, `src/app/upscale-engine.ts`, `src/app/result-store.ts`, and the `onnxruntime-web` package entry map plus the published `realesr-general-x4v3` ONNX model.
- Contract applied: `runtime-shell-required`, `canvas-no-app-ui`, `interaction-surface-ownership`, `controls-product-coverage`, `output-export-required`, `controls-section-inventory-required`, `acceptance-product-observable`, `persistence-policy-explicit`, `infinity-canvas-scene-bounds`.

## Verification

- One bare `npm run verify:delivery` derives and runs the protected proof for this first product delivery: docs/code-health checks, product Vitest gates, one production build, and full functional browser acceptance against the mock upscale API.

## Risks

- Risk: CPU-side inference is slow on large photos; sources are capped at 1024px on the long edge and the README states the expectation.
- Risk: Produced results are session-scoped in memory, so a page reload clears the result while keeping the uploaded source.
- Risk: The upstream template ships one failing signed framework self-test (`scripts/toolcraft-product-control-boundary.test.mjs`), reproduced in a pristine scaffold; it is not fixable from product code.

## Renderer

- Decision: No custom render *pipeline* in the Toolcraft sense. Product output is DOM `img` composition inside `canvasContent`; the shared `exportRenderer` rasterizes the same frame through the runtime-owned 2D export context. The upscaling model runs outside the render path, on demand, when the Upscale action fires.
- Reason: The product displays two decoded photos with a clip split; DOM compositing is exact, cheap, and avoids an unnecessary WebGL/Canvas2D pipeline and performance envelope.
- Evidence: Preview and export both consume the same state targets and module-side bitmap caches; acceptance rows `comparison.view.mode`, `comparison.split.position`, and the export rows prove parity.

## View Interaction

- Decision: `non-spatial`.
- Reason: Flat 2D photos only; nothing rotates in 3D.
- Evidence: `appProductReadiness.viewInteraction` with recorded reason; no `orientationGizmo` targets exist.

## Interaction Ownership

- Decision: Panel-only operations; `comparison-split-position` is declared with panel surface and a canvas alternative rejected.
- Reason: A canvas divider drag would duplicate the slider's capability over the compared output.
- Evidence: `appProductReadiness.interactionOwnership` entry bound to acceptance row `comparison.split.position` via `interactionId`.

## Timeline

- Decision: No timeline.
- Reason: Nothing animates; there is no playback, keyframe, or video-export intent.
- Evidence: `appTransferMode.animationIntent.mode: "none"`; no `panels.timeline` in the schema.

## Layers

- Decision: No layers panel.
- Reason: One source photo and one derived result; there is no multi-object selection, visibility, or reorder behavior.
- Evidence: `panels.layers` is absent; the single `fileDrop` owns media lifecycle with `multiple: false`.

## Controls

- Decision: Entity-first sections — Source Image (fileDrop), Upscale (segmented 2x/4x scale + AI strength slider), Comparison (view segmented + conditional split slider), Background (standard pair, hoisted into Setup), Image Export (format/resolution select pair), and sticky Deliver actions (Upscale + Export PNG).
- Reason: Each section is one product entity; the split slider is conditional on Split view so the panel only shows usable controls.
- Evidence: `appControlSectionInventory` with stable entity ids; acceptance rows cover every control with option coverage on multi-option choices.

## Export

- Decision: Image-only export intent (`toolcraft-default`), runtime-owned `Export PNG` sticky action with the standard Image Export format/resolution section; the non-export `Upscale` action returns its real Promise for progress.
- Reason: The deliverable is a single image; video was never requested.
- Evidence: `productReadiness.exportIntent`; `exportRenderer` with `baseFileName: "clawscale"`; acceptance rows `image-export.*`, `deliver.actions.run`, and `canvas.infinity.scene-export`.

## Performance

- Decision: `rendererStrategy: "none"`, `usesCustomRenderer: false`, empty workload envelope and scenarios; every visible control declares `performanceRole: "responsiveness"` with a reason.
- Reason: There is no continuous rendering workload — the app decodes images on demand and composites them with DOM. The one heavy operation is the user-triggered upscale, which reports its own progress and yields between tiles.
- Evidence: `app-performance.ts` starter-shaped config passing `assessToolcraftRenderPlan`; no workload-role controls exist.
