#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { zipSync } from "fflate";

/**
 * Pack a product's print templates into the archive the app hands back.
 *
 * The app links straight at these rather than building them in the browser:
 * artifact delivery belongs to the runtime, and a static file needs no
 * delivery machinery at all — it is a link to something already served.
 *
 * The archives are committed, so they can drift from the PNGs beside them.
 * `every zone that ships a template can hand it back` in
 * `src/app/app-delivery-schema.test.ts` is what stops that: it opens each
 * archive and compares every entry against the file on disk, byte for byte,
 * and names this command when they differ.
 *
 * Usage: node scripts/build-template-archives.mjs <archive.zip> <name.png>...
 * Paths are relative to public/templates.
 */
const TEMPLATES = "public/templates";

const [archive, ...files] = process.argv.slice(2);
if (!archive || files.length === 0) {
  console.error(
    "Usage: node scripts/build-template-archives.mjs <archive.zip> <name.png>...",
  );
  process.exit(1);
}

const entries = {};
for (const file of files) {
  entries[basename(file)] = new Uint8Array(readFileSync(join(TEMPLATES, file)));
}

// Stored rather than deflated: a PNG is already compressed, so deflating it
// again costs time and saves nothing worth measuring.
const bytes = zipSync(entries, { level: 0 });
writeFileSync(join(TEMPLATES, archive), bytes);
console.log(`${archive}: ${files.length} entries, ${bytes.byteLength} bytes`);
