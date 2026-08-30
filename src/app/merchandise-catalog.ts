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
    // Front and back were already separate materials in the file, which is
    // what made four zones cheap: 116740 carries the +z faces and .010 the
    // -z ones, and the sleeves split by which side of the centre they sit on.
    // Two slots, not three. The four print zones cover every panel of this
    // garment, which leaves the collar rib and the facings turned under the
    // hem as the only parts a design does not land on. The topstitch thread
    // was tried as a third and dropped: in the render where the collar and
    // the hem both took their new colours, the thread did not change, so it
    // would have been a control that appears to do nothing.
    colorParts: {
      accent: { materials: ["Rib_1X1_486gsm_116764"] },
      trim: { materials: ["Shirt_Front_Trim"] },
    },
    excludedNodes: [],
    frame: [0.693905, 0.657851, 0.292794],
    label: "T-Shirt",
    modelFile: "tshirt.glb",
    artworkSurface: "print",
    // Four zones unwrapped in the file, each filling 0 to 1 on its own. The
    // garment was authored in a clothing tool that writes texture coordinates
    // in millimetres, running u from 1460 to 1972, so nothing usable survived
    // in the original. Back and left sleeve are mirrored in u so artwork reads
    // the right way round from those sides.
    //
    screenMaterial: "Shirt_Front",
    artworkZones: {
      back: { material: "Shirt_Back", template: "tshirt-back.png" },
      front: { template: "tshirt-front.png" },
      left: {
        material: "Shirt_Sleeve_Left",
        template: "tshirt-sleeve-left.png",
      },
      right: {
        material: "Shirt_Sleeve_Right",
        template: "tshirt-sleeve-right.png",
      },
    },
  },
  "tote-bag": {
    // Four print zones as separate materials, so each carries its own image on
    // its own unwrap. The handles are separated by connected component: each is
    // a shell of its own that shares no vertex with the bag, so nothing has to
    // guess how far up the panel reaches.
    colorParts: {
      main: { materials: ["Bag_Handles", "Bag_Trim"] },
      trim: { materials: ["Bag_Base"] },
    },
    excludedNodes: [],
    // Measured after the yaw below, which is the order the crop reads them in:
    // turned to face the camera the bag is 0.50 wide where the file has 0.24.
    frame: [0.501205, 0.832377, 0.236522],
    label: "Tote Bag",
    modelFile: "tote-bag.glb",
    artworkSurface: "print",
    // Front, back, left and right are each unwrapped in the file, filling 0 to
    // 1 on their own. Back and left are mirrored in u so artwork reads the
    // right way round from those sides rather than reversed.
    screenMaterial: "Bag_Front",
    artworkZones: {
      back: { material: "Bag_Back", template: "tote-bag-back.png" },
      front: { template: "tote-bag-front.png" },
      left: { material: "Bag_Left", template: "tote-bag-left.png" },
      right: { material: "Bag_Right", template: "tote-bag-right.png" },
    },
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
    artworkZones: { front: { template: "water-bottle-body.png" } },
  },
  "id-card": {
    // The file paints the card and the clasp with one material, so they are
    // split at prep time -- by connected component, which is the boundary the
    // mesh already draws. The card is one shell of 3,552 triangles and the
    // clasp is six others; nothing has to guess where one ends.
    // The printable faces are deliberately not colour slots. A slot that
    // repaints also sets the surface texture aside, which would wipe the very
    // template the card ships with, and a colour under a design is a different
    // feature from a colour instead of one.
    colorParts: {
      accent: { materials: ["Clip"] },
      main: { materials: ["Card_Edge"] },
    },
    excludedNodes: [],
    frame: [0.404106, 0.912342, 0.065813],
    label: "ID Card",
    modelFile: "id-card.glb",
    artworkSurface: "print",
    // Both faces are unwrapped in the file, each filling 0 to 1 on its own, and
    // the back is mirrored in u so artwork reads the right way round when the
    // card is turned rather than appearing reversed. The card measures
    // 2.131 by 3.381, so a design at 0.63 to 1 lands undistorted.
    screenMaterial: "Card_Front",
    artworkZones: {
      back: { material: "Card_Back", template: "id-card-back.png" },
      front: { template: "id-card-front.png" },
    },
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
