import type { ToolcraftImageAsset } from "@/toolcraft/runtime";

import {
  ARTWORK_ZONE_IDS,
  ARTWORK_ZONE_TARGETS,
  type ArtworkZoneId,
} from "./product-domain";

/**
 * Which upload is sitting in each zone's slot.
 *
 * The runtime keeps every asset a person has dropped in one list, tagged with
 * the control it came from, so the slots are read back out by target rather
 * than held as four separate pieces of state. The preview and the export both
 * read them through here, which is what stops an export from showing a
 * different set of panels than the canvas did.
 *
 * The last asset for a target wins, matching what the single slot already did:
 * a `multiple: false` drop replaces rather than accumulates, but the list is
 * append-only and the newest is the one on screen.
 */
export function readZoneAssets(
  assets: readonly { assetKind?: string; sourceTarget?: string }[],
): ReadonlyMap<ArtworkZoneId, ToolcraftImageAsset> {
  const byZone = new Map<ArtworkZoneId, ToolcraftImageAsset>();
  for (const zone of ARTWORK_ZONE_IDS) {
    const target = ARTWORK_ZONE_TARGETS[zone];
    const latest = assets
      .filter(
        (asset): asset is ToolcraftImageAsset =>
          asset.assetKind === "image" && asset.sourceTarget === target,
      )
      .at(-1);
    if (latest) byZone.set(zone, latest);
  }
  return byZone;
}
