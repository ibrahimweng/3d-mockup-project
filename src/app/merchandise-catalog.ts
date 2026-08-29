/**
 * The merchandise this studio prints on, as distinct from the devices it
 * displays on.
 *
 * Split out of `product-domain.ts` because that file carries the option lists
 * and the types every product shares, and adding a second family of products
 * to it pushed it past the line budget generated scripts are held to. The
 * split is along the seam the catalog already has: a device shows a design on
 * a screen it emits from, and merchandise carries one printed on its surface.
 */
import type { DeviceDefinition } from "./product-domain";

export const MERCHANDISE_CATALOG = {
  tshirt: {
    // The garment is one shell material with the sleeves, collar and lining
    // authored separately, which is what makes three colour slots land on
    // parts a person would actually name.
    colorParts: {
      accent: { materials: ["Rib_1X1_486gsm_116764"] },
      main: {
        materials: [
          "Cotton_Heavy_Twill_116740",
          "Cotton_Heavy_Twill_116740.010",
        ],
        repaint: true,
      },
      trim: { materials: ["Cotton_Heavy_Twill_Copy_1_116819"] },
    },
    excludedNodes: [],
    // Re-measured after the topstitch was stripped: the thread stood a
    // fraction proud of the fabric, so the box it was measured from was not
    // quite the box that ships.
    frame: [0.694001, 0.657747, 0.2928],
    label: "T-Shirt",
    modelFile: "tshirt.glb",
    artworkSurface: "print",
    // The torso is one surface wrapping front and back, so a planar projection
    // prints the same design on both. That is what was asked for.
    //
    // It has to be re-unwrapped: the garment was authored in a clothing tool
    // that writes texture coordinates in millimetres, so this panel runs u from
    // 1460 to 1972 and v from -1587 to -937. Left alone a design would tile
    // several hundred times across the chest.
    screenUnwrap: true,
    screenMaterial: "Cotton_Heavy_Twill_116740",
  },
  "tote-bag": {
    colorParts: {
      // Bag and handles are one material, so one slot is all there is to offer.
      // The canvas scribble it ships with is its own colour rather than a
      // neutral weave, so a colour has to replace it rather than tint it.
      main: { materials: ["Default"], repaint: true },
    },
    excludedNodes: [],
    // Measured after the yaw below, which is the order the crop reads them in:
    // turned to face the camera the bag is 0.50 wide where the file has 0.24.
    frame: [0.501205, 0.832377, 0.236522],
    label: "Tote Bag",
    modelFile: "tote-bag.glb",
    artworkSurface: "print",
    screenUnwrap: true,
    screenMaterial: "Default",
    // The bag's face normal points along X and the camera looks down +Z, so
    // without this it presents its 2.8-unit edge instead of its 6-unit face.
    yawDegrees: 90,
  },
  "water-bottle": {
    // Split by height, which is where the parts actually divide: the body is
    // everything below the thread and the head is the cap that screws onto it.
    colorParts: {
      accent: { materials: ["Bottle_Head_Latch"] },
      main: { materials: ["Bottle_Head_Cap"] },
      trim: { materials: ["Bottle_Head_Ring"] },
    },
    excludedNodes: [],
    frame: [0.315724, 0.875884, 0.364891],
    label: "Water Bottle",
    modelFile: "water-bottle.glb",
    artworkSurface: "print",
    artworkFit: "wrap",
    // The body carries one continuous wrap, written into the file rather than
    // computed here: angle around the axis is u, height is v, and the join is
    // a single seam at the back. Measured from the geometry, the wrap is
    // 1.13 to 1, so a design authored at that ratio lands undistorted.
    screenMaterial: "Bottle_Body",
  },
  "id-card": {
    colorParts: {
      // Card and clip are one mesh sharing one material, so the card cannot be
      // painted without the clip. One slot, honestly named.
      main: { materials: ["material_0"], repaint: true },
    },
    excludedNodes: [],
    frame: [0.404106, 0.912342, 0.065813],
    label: "ID Card",
    modelFile: "id-card.glb",
    artworkSurface: "print",
    // Its own coordinates put the card face in one corner of an atlas and the
    // clip in another, which is right for the badge printed into the file and
    // useless for a design supplied at runtime. Projected instead, so a design
    // fills the card; the clip stands above it and catches the top edge.
    screenUnwrap: true,
    screenMaterial: "material_0",
    clearPrintRelief: true,
    // Authored fully metallic with its roughness in a map, which is right for
    // the foil badge printed into the file and wrong for anything printed over
    // it: a design on a mirror is a design nobody can read.
    materialCorrections: { material_0: { metalness: 0, roughness: 0.55 } },
  },
  "tablet-folder": {
    colorParts: {
      accent: { materials: ["blinn2@Pin_blinn2_0"], repaint: true },
      main: { materials: ["blinn2@Tablet_blinn2_0"], repaint: true },
      trim: { materials: ["blinn2@Pen_blinn2_0"], repaint: true },
    },
    excludedNodes: [],
    frame: [0.793326, 0.040254, 0.607464],
    label: "Tablet Folder",
    modelFile: "tablet-folder.glb",
    artworkSurface: "print",
    // One material paints the board, the pen, the clip and the sheets, and the
    // parts are separated by mesh instead. Splitting per mesh gives each a name
    // the catalog can address without touching the file.
    splitMaterialsByMesh: true,
    screenUnwrap: true,
    // The top sheet, which is the largest flat face and the one a document
    // mockup is about. The board beneath it is the main colour.
    screenMaterial: "blinn2@StackOfPaper_blinn2_0",
    clearPrintRelief: true,
    // Same as the card: authored metallic with its surface detail in maps that
    // describe the sheet's printed contents rather than paper.
    materialCorrections: {
      "blinn2@StackOfPaper_blinn2_0": { metalness: 0, roughness: 0.75 },
    },
  },
} satisfies Readonly<Record<string, DeviceDefinition>>;
