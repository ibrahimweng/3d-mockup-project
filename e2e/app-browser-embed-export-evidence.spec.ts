import { expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";

import { appAcceptance } from "../src/app/app-acceptance-data";
import { expectToolcraftExportedArtifact } from "./browser-acceptance-outcome-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { openTimeline } from "./mockup-timeline";
import { test } from "./toolcraft-product-test";

test.setTimeout(1_800_000);

const requirementId = "embed-export.bundle";
const browserTestName =
  appAcceptance.find((row) => row.id === requirementId)?.browserTestName ??
  "browser: embed export";

type EmbedZip = Readonly<{ bytes: Uint8Array; files: Record<string, Uint8Array> }>;

/** Unpack the bundle onto disk so its own player can be opened as a page. */
function writeBundle(files: Record<string, Uint8Array>): string {
  const root = mkdtempSync(join(tmpdir(), "mockup-embed-"));

  for (const [name, bytes] of Object.entries(files)) {
    const target = join(root, name);

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }

  return root;
}

/**
 * Whether the shipped player actually moves, on a page it knows nothing about.
 *
 * Hashed whole rather than by any prefix: every PNG of the same size shares a
 * header, so comparing the front of two screenshots compares nothing.
 */
async function countDistinctPlayerFrames(page: Page, root: string): Promise<number> {
  await page.goto(`file://${root}/index.html`);
  // A colour the bundle cannot know about. Anything of it showing through the
  // device's own shadow is the transparency doing its job.
  await page.addStyleTag({ content: "body { background: #d94f2b; }" });
  await page.waitForTimeout(4_000);

  const canvas = page.locator("#stage");
  const hashes = new Set<string>();

  for (let sample = 0; sample < 4; sample += 1) {
    hashes.add(createHash("sha256").update(await canvas.screenshot()).digest("hex"));
    await page.waitForTimeout(900);
  }

  return hashes.size;
}

test(browserTestName, async ({ page }) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.waitForTimeout(4_000);
  await openTimeline(page);

  // Something to animate: the preset keys a full revolution across the loop.
  await page.getByRole("button", { name: "Turntable" }).first().click();
  await page.waitForTimeout(800);

  // Run through the session's own target action rather than a bare closure.
  // The evidence a proof attaches has to carry the target its requirement
  // names, and the target is what the action knows and a closure does not.
  const bundle = await expectToolcraftExportedArtifact<EmbedZip, never>(
    session.targetAction("panel.actions", async (current) => {
      const download = current.waitForEvent("download", { timeout: 900_000 });

      await current.getByRole("button", { name: "Export Embed" }).first().click();
      const stream = await (await download).createReadStream();
      const chunks: Buffer[] = [];

      for await (const chunk of stream) chunks.push(chunk as Buffer);
      const bytes = new Uint8Array(Buffer.concat(chunks));

      return { bytes, files: unzipSync(bytes) };
    }),
    ({ bytes, files }) => {
      const manifest = JSON.parse(
        new TextDecoder().decode(files["manifest.json"]!),
      ) as {
        durationSeconds: number;
        fps: number;
        frameCount: number;
        frames: string[];
        height: number;
        width: number;
      };

      expect(
        manifest.frames.filter((name) => !(name in files)),
        "Every frame the manifest promises has to be in the bundle.",
      ).toEqual([]);
      expect(files["index.html"], "The bundle has to carry its own player.").toBeDefined();
      expect(files["README.md"], "The bundle has to say how to use it.").toBeDefined();

      const first = files[manifest.frames[0]!]!;
      const last = files[manifest.frames.at(-1)!]!;

      expect(
        new TextDecoder().decode(first.slice(0, 4)),
        "Frames have to be RIFF containers.",
      ).toBe("RIFF");
      expect(
        new TextDecoder().decode(first.slice(8, 12)),
        "Frames have to be WebP.",
      ).toBe("WEBP");
      // VP8X is the extended container, and the only one of the three that can
      // carry an alpha channel — which is the whole point of this export.
      expect(
        new TextDecoder().decode(first.slice(12, 16)),
        "Frames have to be the extended WebP that carries alpha.",
      ).toBe("VP8X");
      // The seam: a full turn draws the same picture at both ends, so a
      // sequence carrying both would hold it for two frames every time round.
      expect(
        Buffer.compare(Buffer.from(first), Buffer.from(last)),
        "The last frame must not repeat the first, or the loop hitches.",
      ).not.toBe(0);

      return {
        byteLength: bytes.length,
        frameCount: manifest.frameCount,
        height: manifest.height,
        kind: "binary" as const,
        mediaType: "application/zip",
        width: manifest.width,
      };
    },
    { requirementId },
  );

  const distinctFrames = await countDistinctPlayerFrames(page, writeBundle(bundle.files));

  expect(
    distinctFrames,
    "The shipped player has to advance through the loop, not hold one frame.",
  ).toBeGreaterThan(1);
});
