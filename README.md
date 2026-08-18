# Clawscale

AI image upscaler that runs **entirely in your browser** — free, private, and
with no backend. Built on the [Toolcraft](https://toolcraft.sh) app framework,
powered by Real-ESRGAN through
[ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/).

Live at **https://clawscale.vercel.app**. The web app is the whole product:
there is nothing to install and nothing that runs on your machine.

Upload a photo, pick 2× or 4× and an AI strength, and the model runs inside the
page. The image is never uploaded to a server. There is no API key, no account,
and nothing to pay for.

## Develop

```bash
npm install
npm run dev
```

## Deploy

It is a static site — `npm run build` produces `dist/`, which any free static
host serves (Vercel, Netlify, GitHub Pages, Cloudflare Pages). There are no
serverless functions and no environment variables.

## How an upscale runs

1. The browser decodes the uploaded photo (capped at 1024px on the long edge so
   a run stays quick).
2. `realesr-general-x4v3.onnx` (4.6 MB) runs tile by tile through ONNX Runtime
   Web on the CPU backend, producing a 4× image.
3. The result is resampled to the requested factor and blended over a plain
   enlargement by the AI-strength slider, then shown in the before/after
   comparison and used for PNG/JPG export.

## Assets and licensing

- `public/models/realesr-general-x4v3.onnx` — Real-ESRGAN compact model
  (BSD-3-Clause, Xintao Wang et al.).
- `public/ort/ort-wasm-simd-threaded.wasm` — ONNX Runtime Web binary (MIT,
  Microsoft), copied from the `onnxruntime-web` package so the dev server and
  the static build serve the same file.

## Performance note

Inference uses the CPU (WASM) backend. ONNX Runtime's WebGPU build is far
faster, but it needs a loader sidecar file that this project's module-boundary
rules cannot ship, so the CPU path — which works everywhere — is the one wired
up. A 1024px photo takes roughly a minute; small images are near-instant.
