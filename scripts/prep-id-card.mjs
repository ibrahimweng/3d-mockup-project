#!/usr/bin/env node
/**
 * Build the ID card: a printed PVC card hanging from a metal swivel clasp.
 *
 * Usage:
 *   node scripts/prep-id-card.mjs
 *
 * Reads the bought source named in `sourceModel` below, writes
 * `public/models/id-card.glb`, and embeds the templates from
 * `public/templates` as each printed face's starting image.
 *
 * The card is one connected component and the clasp is six others, so the split
 * needs no measurement at all: the mesh already draws the boundary, and every
 * triangle is on exactly one side of it.
 *
 * Two earlier versions guessed at that boundary instead. The first called
 * everything above atlas v 0.66 "the clip", which swept up the badge's own
 * reinforced top and rendered a sixth of the face as brushed steel. The second
 * called everything above y 1.73 the clip, and cut the clasp's jaw in half: 176
 * of its triangles came out wearing card materials and 97 of those wearing the
 * printed faces, which is the artwork seen running over the metal.
 *
 * Shell 0 is the card because it is the largest -- 3,552 triangles against the
 * clasp's largest piece at 1,020. Nothing about where it sits is asked.
 */

import { prepZones, repoPath, sourceModel } from "./prep-model-zones.mjs";

const template = (name) => repoPath("public", "templates", `${name}.png`);

// A printed card is plastic: no metal, a little sheen.
const PVC = { metalness: 0, roughness: 0.42 };

const report = await prepZones({
  classify: (f) => {
    if (f.shell !== 0) return "Clip";
    const nz = f.WN[2];
    if (nz > 0.7) return "Card_Front";
    if (nz < -0.7) return "Card_Back";
    return "Card_Edge";
  },
  input: sourceModel("id-card.glb"),
  leftover: "Card_Edge",
  material: "material_0",
  output: repoPath("public", "models", "id-card.glb"),
  // The card's rim carries 38 edges where the stored normals jump across
  // geometry that is flat -- a line drawn over nothing, inherited from the
  // original. Recomputing them keeps the right angle where the face meets the
  // rim, because that turn is well past the threshold.
  smoothCreases: { thresholdDegrees: 40 },
  // The file's normal map is the badge's own embossed lettering and the foil it
  // was printed on, which is someone else's artwork rather than card stock.
  // Carrying it onto a printable face would stamp a design into it.
  weaveDefault: false,
  zones: {
    Card_Front: { ...PVC, flatten: true, template: template("id-card-front"), unwrap: ["x", "y"] },
    // Mirrored in u so the artwork reads the right way round when the card is
    // turned over rather than appearing back to front.
    Card_Back: { ...PVC, flatten: true, flipU: true, template: template("id-card-back"), unwrap: ["x", "y"] },
    Card_Edge: { ...PVC, baseColor: [0.93, 0.93, 0.94, 1] },
    Clip: { baseColor: [0.79, 0.8, 0.82, 1], metalness: 1, roughness: 0.28 },
  },
});

for (const [zone, { span, tris }] of Object.entries(report)) {
  console.log(`  ${zone.padEnd(12)} ${String(tris).padStart(5)} tris  span ${span ? span.join(" x ") : "-"}`);
}
