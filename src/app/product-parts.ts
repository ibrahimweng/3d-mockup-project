/**
 * The vocabulary a product uses to describe its own surfaces.
 *
 * Separate from the catalog because the catalog is the list of products and
 * this is the language every entry in it is written in. Keeping them apart
 * also keeps `product-domain.ts` inside the line budget generated app source
 * is held to.
 */
/**
 * The three parts a colour picker can reach, shared across every product.
 *
 * Schema controls are static, so this cannot be a per-product list of named
 * parts: one product's "sleeves" and another's "cap" would each need their own
 * control, and a section is capped at ten. Three slots with the same meaning
 * everywhere is what fits — the main surface, the trim around it, and one
 * accent — and each product maps them onto its own materials, exactly as the
 * finishes do.
 */
export const COLOR_PART_IDS = ["main", "trim", "accent"] as const;

export type ColorPartId = (typeof COLOR_PART_IDS)[number];

/**
 * Which of a product's materials one colour slot paints.
 *
 * `repaint` sets a material's base-colour texture aside for as long as a colour
 * is chosen, for the same reason `repaintedMaterials` does: a texture carrying
 * its own colour only tints, so painting a printed canvas bag blue over its
 * scribble pattern yields a blue scribble rather than a blue bag.
 */
export type ColorPart = {
  materials: readonly string[];
  repaint?: boolean;
};

/**
 * How a supplied design sits on the surface it is bound to.
 *
 * A display emits, so a screenshot is bound to the emissive channel and reads
 * at full brightness whatever the studio is doing. Print does not emit. A
 * design bound the same way on a shirt would glow in an unlit corner, which is
 * the one thing a garment mockup can never do, so print writes base colour
 * alone and takes the lighting like the fabric around it.
 */
export type ArtworkSurface = "display" | "print";

/**
 * How a supplied design is sized onto the surface it prints on.
 *
 * "fit" is the display behaviour: the design is scaled and offset to sit well
 * inside a panel whose proportions it does not know. "wrap" is for a surface
 * whose texture coordinates were authored for exactly one image, such as a
 * cylinder unwrapped once around its axis. There the design has to land one to
 * one, because scaling it moves the two ends apart and opens the seam.
 */
export type ArtworkFit = "fit" | "wrap";

/**
 * The four print zones a design can be uploaded to, shared across every
 * product.
 *
 * The same constraint that gives the colour slots their three names gives
 * these their four: schema controls are static, so a product cannot declare
 * "left sleeve" and have a control appear for it. Four slots that mean the
 * same thing on every product is what fits, and each product maps them onto
 * its own zones — the tote's left panel and the shirt's left sleeve are both
 * `left`, because from the front of the model they are the same place.
 *
 * `front` is the one every product has, and it is the slot a device uses for
 * its screenshot. The other three appear only where a product declares them.
 */
export const ARTWORK_ZONE_IDS = ["front", "back", "left", "right"] as const;

export type ArtworkZoneId = (typeof ARTWORK_ZONE_IDS)[number];

/**
 * One printable zone of one product.
 *
 * A zone is a material with its own unwrap filling 0..1, so a design bound to
 * it lands on that panel and nowhere else. `aspect` and `fit` are per zone
 * rather than per product because the panels of one product are not the same
 * shape — a tote's side is half the width of its front — and because the
 * bottle wraps where everything else fits.
 */
export type ArtworkZone = {
  /** Height / width, when measuring the panel cannot give it. */
  aspect?: number;
  /** How the design is sized onto this zone. Defaults to the product's. */
  fit?: ArtworkFit;
  /** The material carrying this zone's print, by name. */
  material: string;
  /**
   * The placeholder this zone ships with, as a file under `public/templates`.
   *
   * The same image is baked into the GLB as the zone's base colour, so this is
   * not a second copy of anything — it is the name of the file the model was
   * built from, which is what lets the app hand it back to someone about to
   * draw a design. A zone with no entry has no template to offer, which is
   * every device: a screen has proportions but no printed sheet.
   */
  template?: string;
};

/**
 * Where the templates are served from, and what a product's archive is called.
 *
 * A product with several zones hands back one archive rather than one download
 * per zone, because one press producing four saves is something browsers ask
 * permission for and people read as a fault. The archives are built by
 * `scripts/build-template-archives.mjs` and committed beside the images.
 */
export const TEMPLATE_DIRECTORY = "/templates";

export function artworkTemplateArchive(productId: string): string {
  return `${productId}-templates.zip`;
}

/**
 * The schema target each zone's upload writes to.
 *
 * Written out rather than derived so a search for the target finds it. The
 * front slot keeps `artwork.image`, which is what every device already uses
 * and what the media-lifecycle contract names.
 */
export const ARTWORK_ZONE_TARGETS: Readonly<Record<ArtworkZoneId, string>> = {
  back: "artwork.imageBack",
  front: "artwork.image",
  left: "artwork.imageLeft",
  right: "artwork.imageRight",
};

/**
 * The separator between a shared material's name and the mesh it was split for.
 *
 * Lives here rather than beside the split itself because the catalog writes
 * these names by hand and the model inventory has to take them apart again,
 * and neither of those can reach into the renderer.
 */
export const SPLIT_MATERIAL_SEPARATOR = "@";

/**
 * What each colour slot starts on.
 *
 * A neutral rather than each product's authored colour, and it has to be: the
 * controls are shared, so one default serves a shirt, a bottle and a card at
 * once. Blank stock is also the honest starting point for a mockup, which is a
 * product waiting to be printed rather than one already finished.
 *
 * The accent read `#3a3836` and that is not blank stock, it is black. Three of
 * the four parts it lands on are hardware -- a card's nickel clasp, a bottle's
 * latch, a folder's steel clip -- and the fourth is a shirt's collar rib, which
 * the control's own description names first. So a plain white tee opened with a
 * black collar and a black band round its hem: a finished garment, and the
 * first thing anyone saw. Nothing in the file said so; the shirt's own rib is
 * off-white. It was this default painting over it.
 *
 * A mid neutral serves all four. On metal, base colour tints the reflection, so
 * the clasp and the clip read as brushed steel where they read as gunmetal
 * before; on the latch it reads as an unfinished moulding; on the rib it reads
 * as a rib. The three still separate: lightest is the body, then the trim set
 * against it, then the accent.
 */
export const DEFAULT_PART_COLORS: Readonly<Record<ColorPartId, string>> = {
  accent: "#8a8681",
  main: "#e8e5df",
  trim: "#c9c5bd",
};

/**
 * What a design is printed on where the design itself is transparent.
 *
 * The blank stock, which is `main` above and not white. A print zone's base
 * colour is set to white while something is printed on it, so the surface under
 * the ink cannot tint it -- which means the transparent parts of a design are
 * filled at composite time by this, and nothing else. Set it to white and the
 * whole platen becomes a white rectangle sitting brighter than the cloth around
 * it, with a hard straight edge across the panel. That is what made a design
 * read as a sticker laid on the bag rather than ink printed into it.
 *
 * Tied to the main colour rather than repeated, so recolouring the product
 * cannot leave the unprinted part of its own print area the previous colour.
 */
export const DEFAULT_ARTWORK_BACKGROUND = DEFAULT_PART_COLORS.main;

/**
 * One colourway on one device.
 *
 * `body` paints every material the device lists as its shell, so a device with
 * a dozen materials carrying the same finish needs one colour rather than a
 * dozen. `accents` covers the parts that are deliberately a different colour —
 * a watch band against its case.
 */
