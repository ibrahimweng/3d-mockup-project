#!/usr/bin/env node
/**
 * Build the picture a shared link shows.
 *
 * The studio can already make a photoreal product shot, so the preview is one
 * of those rather than a drawing of one. This drives the built app the way a
 * person would — pick the Design tab, drop an image on the display, turn the
 * product, press Export PNG — and then lays the exported render beside the
 * product name at the 1200 by 630 that every link preview crops to.
 *
 * Run it after `npm run build`, because it drives `dist` rather than the dev
 * server. The two files it writes are committed, so nobody needs to run this
 * to deploy. Run it when the wording changes or the default product does.
 */

import { chromium } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(appRoot, "dist");
const port = 4319;

const contentTypes = {
  ".css": "text/css",
  ".glb": "model/gltf-binary",
  ".hdr": "image/vnd.radiance",
  ".html": "text/html",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".zip": "application/zip",
};

function serveDist() {
  const server = http.createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://local").pathname);
    let file = path.join(distDir, requested);
    // The router answers for every path, exactly as the deployment rewrite does.
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(distDir, "index.html");
    }
    response.setHeader(
      "content-type",
      contentTypes[path.extname(file)] ?? "application/octet-stream",
    );
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/** The design that goes on the display. Drawn here so no artwork is committed. */
const designMarkup = `<style>
  html, body { height: 100%; margin: 0; }
  body {
    background:
      radial-gradient(120% 80% at 78% 12%, rgba(255, 214, 153, .55) 0%, rgba(255, 214, 153, 0) 55%),
      radial-gradient(110% 70% at 12% 88%, rgba(120, 180, 255, .45) 0%, rgba(120, 180, 255, 0) 60%),
      linear-gradient(158deg, #161546 0%, #3B2C8F 34%, #A93F8E 66%, #F0834B 100%);
    overflow: hidden;
  }
  .ring { border: 4px solid rgba(255, 255, 255, .20); border-radius: 50%; position: absolute; }
</style>
<div class="ring" style="height: 1500px; left: -330px; top: 520px; width: 1500px"></div>
<div class="ring" style="height: 1050px; left: 300px; top: 900px; width: 1050px"></div>
<div class="ring" style="height: 640px; left: 620px; top: 250px; width: 640px"></div>`;

function cardMarkup(renderDataUri) {
  return `<style>
  @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&display=swap');
  html, body { height: 630px; margin: 0; overflow: hidden; width: 1200px; }
  body {
    background: linear-gradient(100deg, #171A1F 0%, #101216 42%, #050506 74%, #000 100%);
    color: #F2F3F5; font-family: Archivo, system-ui, sans-serif; position: relative;
  }
  .copy { left: 76px; position: absolute; top: 50%; transform: translateY(-50%); width: 520px; z-index: 2; }
  .mark { align-items: center; display: flex; gap: 11px; margin-bottom: 26px; }
  .mark span { color: #8F97A3; font-size: 14px; font-weight: 600; letter-spacing: .17em; text-transform: uppercase; }
  h1 { font-size: 50px; font-weight: 700; letter-spacing: -.032em; line-height: 1.06; margin: 0 0 18px; }
  p { color: #A0A7B2; font-size: 19px; font-weight: 500; line-height: 1.5; margin: 0; width: 430px; }
  .feet { display: flex; gap: 9px; margin-top: 30px; }
  .feet b { border: 1px solid #2A2F38; border-radius: 999px; color: #B9C0C9; font-size: 13px; font-weight: 500; padding: 6px 14px; }
  /* The render's own background is black, so its edges are faded into the
     card's rather than sitting on it as a rectangle. */
  .shot {
    height: 800px; position: absolute; right: 14px; top: 50%;
    transform: translateY(-50%); z-index: 1;
    -webkit-mask-image: radial-gradient(ellipse 62% 58% at 50% 50%, #000 62%, transparent 88%);
  }
  .shot img { display: block; height: 100%; }
</style>
<div class="shot"><img alt="" src="${renderDataUri}"></div>
<div class="copy">
  <div class="mark">
    <svg width="24" height="24" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#1C1F26"/><rect x="11" y="7" width="10" height="18" rx="2.4" fill="none" stroke="#E8E8EA" stroke-width="1.7"/></svg>
    <span>Mockup Studio</span>
  </div>
  <h1>Photoreal product mockups, in your browser.</h1>
  <p>Drop in a screenshot or a design. Light it, turn it, export it. Nothing is uploaded.</p>
  <div class="feet"><b>Free</b><b>No account</b><b>No upload</b></div>
</div>`;
}

async function exportProductShot(browser, designPath) {
  const page = await browser.newPage({ viewport: { height: 1000, width: 1600 } });
  await page.goto(`http://localhost:${port}/`, { timeout: 120_000, waitUntil: "networkidle" });
  // The model, its environment map and the opening preset all have to land.
  await page.waitForTimeout(18_000);

  await page.getByRole("tab", { name: "Design" }).click();
  await page.waitForTimeout(1_500);
  await page.locator('input[type="file"]').first().setInputFiles(designPath);
  await page.waitForTimeout(15_000);

  // A three-quarter view, made the way anyone makes one: by dragging the body.
  const canvas = await page.locator("canvas").boundingBox();
  const startX = canvas.x + 250;
  const startY = canvas.y + canvas.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 95, startY - 30, { steps: 25 });
  await page.mouse.up();
  await page.waitForTimeout(9_000);

  // The studio's own export, so the preview is the thing the studio makes.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180_000 }),
    page.getByRole("button", { name: "Export PNG" }).click(),
  ]);
  const renderPath = path.join(appRoot, "node_modules", ".cache", "social-render.png");
  fs.mkdirSync(path.dirname(renderPath), { recursive: true });
  await download.saveAs(renderPath);
  await page.close();
  return renderPath;
}

async function main() {
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    throw new Error("Run `npm run build` first: this drives dist, not the dev server.");
  }

  const server = await serveDist();
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });

  try {
    const design = await browser.newPage({ viewport: { height: 2556, width: 1179 } });
    await design.setContent(designMarkup);
    const designPath = path.join(appRoot, "node_modules", ".cache", "social-design.png");
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    await design.screenshot({ path: designPath });
    await design.close();

    const renderPath = await exportProductShot(browser, designPath);
    const renderDataUri = `data:image/png;base64,${fs.readFileSync(renderPath).toString("base64")}`;

    const card = await browser.newPage({
      deviceScaleFactor: 1.5,
      viewport: { height: 630, width: 1200 },
    });
    await card.setContent(cardMarkup(renderDataUri));
    // The web font has to arrive before the shutter.
    await card.waitForTimeout(2_500);
    await card.screenshot({
      path: path.join(appRoot, "public", "social-preview.jpg"),
      quality: 90,
      type: "jpeg",
    });
    await card.close();

    const icon = await browser.newPage({ viewport: { height: 180, width: 180 } });
    await icon.setContent(`<style>html, body { height: 180px; margin: 0; width: 180px; }</style>
<svg width="180" height="180" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#0D0D10"/>
  <rect x="11" y="7" width="10" height="18" rx="2.4" fill="none" stroke="#E8E8EA" stroke-width="1.7"/>
</svg>`);
    await icon.screenshot({ path: path.join(appRoot, "public", "apple-touch-icon.png") });
    await icon.close();

    console.log("Wrote public/social-preview.jpg and public/apple-touch-icon.png");
  } finally {
    await browser.close();
    server.close();
  }
}

await main();
