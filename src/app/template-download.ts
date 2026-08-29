import {
  readArtworkTemplates,
} from "./product-applicability";
import {
  artworkTemplateArchive,
  TEMPLATE_DIRECTORY,
  type DeviceDefinition,
  type DeviceId,
} from "./product-domain";

/**
 * Hand back the templates the loaded product was built from.
 *
 * A link to a served file rather than anything assembled here, and that is
 * two decisions rather than one.
 *
 * The images are the ones baked into the GLB, fetched rather than
 * regenerated. The whole value of a template is that it is the same picture
 * the model renders before an upload, at the size and orientation that zone's
 * unwrap expects, so a design drawn over one lands exactly where it was
 * drawn. A second generator is a second chance to disagree with the first,
 * and the disagreement would not show until someone's logo came out a few
 * pixels off.
 *
 * The archive is built by `scripts/build-template-archives.mjs` and committed,
 * rather than zipped in the browser. Artifact delivery belongs to the runtime,
 * and a static file asks for none of it: this is an anchor pointed at
 * something already being served.
 */
export function readTemplateDownload(
  device: DeviceDefinition,
  productId: DeviceId,
): { href: string; name: string } | null {
  const templates = readArtworkTemplates(device);
  if (templates.length === 0) return null;

  const name =
    templates.length === 1
      ? templates[0].file
      : artworkTemplateArchive(productId);
  return { href: `${TEMPLATE_DIRECTORY}/${name}`, name };
}

export function downloadArtworkTemplates(
  device: DeviceDefinition,
  productId: DeviceId,
): void {
  const download = readTemplateDownload(device, productId);
  if (!download) return;

  const link = document.createElement("a");
  link.download = download.name;
  link.href = download.href;
  document.body.append(link);
  link.click();
  link.remove();
}
