import type { EmbedManifest } from "./embed-export";

/**
 * The page the bundle ships, written out as text rather than built.
 *
 * It has to stand on its own on somebody else's site, so it carries no
 * imports, no framework and no build step: one file that draws a canvas and
 * advances it. Everything it needs is in the manifest it is written against.
 */
export function createEmbedPlayerHtml(manifest: EmbedManifest, title: string): string {
  const config = JSON.stringify({
    durationSeconds: manifest.durationSeconds,
    frames: manifest.frames,
    height: manifest.height,
    width: manifest.width,
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  /* Transparent all the way down, so the page behind decides the colour. */
  html, body { margin: 0; padding: 0; background: transparent; }
  #stage { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
<canvas id="stage" width="${manifest.width}" height="${manifest.height}"></canvas>
<script>
(function () {
  var config = ${config};
  var canvas = document.getElementById("stage");
  var context = canvas.getContext("2d");
  var images = [];
  var loaded = 0;

  /* Every frame is decoded before the first is shown. A sequence that starts
     while it is still downloading stutters through its first loop, which is
     the loop somebody scrolling past actually sees. */
  function start() {
    var reduced = window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    draw(0);
    if (reduced || config.durationSeconds <= 0) return;

    var began = null;
    function tick(now) {
      if (began === null) began = now;
      var elapsed = ((now - began) / 1000) % config.durationSeconds;
      draw(Math.floor((elapsed / config.durationSeconds) * images.length) % images.length);
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  function draw(index) {
    var image = images[index];
    if (!image) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  config.frames.forEach(function (source, index) {
    var image = new Image();
    image.onload = image.onerror = function () {
      loaded += 1;
      if (loaded === config.frames.length) start();
    };
    image.src = source;
    images[index] = image;
  });
})();
</script>
</body>
</html>
`;
}

export function createEmbedReadme(manifest: EmbedManifest, approximateBytes: number): string {
  const megabytes = (approximateBytes / (1024 * 1024)).toFixed(1);

  return `# Embedded mockup

${manifest.frameCount} frames at ${manifest.fps} a second, ${manifest.width} by ${manifest.height},
looping every ${manifest.durationSeconds} seconds. About ${megabytes}MB in total.

## Putting it on a page

Drop this whole folder into your site's public directory, then either point an
iframe at index.html:

    <iframe src="/mockup-embed/index.html" style="border:0;width:100%;aspect-ratio:${manifest.width}/${manifest.height}" title="Mockup"></iframe>

or copy the canvas and script out of index.html into your own page, and fix up
the frame paths so they still resolve.

## Why frames rather than a video

Every frame carries its own transparency, so the device sits on whatever colour
your page is rather than in a box. Video cannot be relied on for that: WebM
carries alpha where Safari will not, and Safari wants HEVC in an MP4 instead.

The cost is that each frame is stored whole, with none of the compression a
video gets from one frame resembling the last. That is why this is
${manifest.fps} frames a second at ${manifest.width} across rather than
something larger.

## Reduced motion

The player holds on the first frame for anyone whose system asks for reduced
motion, rather than looping behind their back.
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
