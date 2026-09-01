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
    //
    // One slot, not three. A tee is one bolt of jersey with a rib collar sewn
    // to it, and the collar is the only part of it made of something else, so
    // it is the only part with a colour of its own. Everything the four prints
    // do not reach -- the hem band, the cuffs, the head of each sleeve, the
    // facings turned under -- is the same cloth as the panels, and follows the
    // print background with them. On slots of their own they were a second
    // opinion: colouring the shirt in Parts turned the hem, the cuffs and the
    // cuffs that colour and left every printed panel on the background,
    // which is a contrast-yoke ringer tee arrived at by accident.
    blankStockMaterials: ["Shirt_Body", "Shirt_Front_Trim"],
    colorParts: {
      accent: { materials: ["Rib_1X1_486gsm_116764"] },
    },
    excludedNodes: [],
    frame: [0.693905, 0.657851, 0.292794],
    label: "T-Shirt",
    modelFile: "tshirt.glb",
    artworkSurface: "print",
    // Four print areas, each filling its whole panel and filling 0 to 1 on its
    // own: front and back from the shoulder to the hem and side seam to side
    // seam, and each sleeve round the arm from the cuff to the shoulder.
    // The boundaries are the garment's own -- the modeller cut this shirt into
    // pieces and each panel is a primitive -- so no edge has to be guessed.
    //
    // The unwrap is written into the file and follows the cloth rather than a
    // plane: the shirt is sliced into rings, across the body for the panels and
    // across each sleeve's own axis for the sleeves, and a point sits where it
    // falls along its own ring. A panel wraps round the body, and projected
    // onto a plane the cloth past the turn prints back to front.
    //
    // A panel is not a rectangle -- there is a neck curve and two armholes cut
    // out of it -- so the corners of a design land where the cloth is not, and
    // its template shows the outline. `Shirt_Body` is the hem, the cuffs, the
    // the facings: everything a print stops at.
    //
    // The garment was authored in a clothing tool that writes texture
    // coordinates in millimetres, so nothing usable survived in the original
    // unwrap -- but those millimetres are what gives the model its scale: one
    // world unit is one metre.
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
    //
    // The bag is a closed shell, so it has an inside as well as an outside.
    // `Bag_Lining` is what you look down into through the mouth, and it also
    // takes the crown of the mouth -- the couple of millimetres where the cloth
    // turns over the rim, which no unwrap up the side of the bag can hold. Both
    // it and the handles take the main colour; the base has its own slot, which
    // is where a contrast bottom would go. Nothing else is left: the four sides
    // are printed edge to edge, so all the outside cloth is a print zone.
    colorParts: {
      main: { materials: ["Bag_Handles", "Bag_Lining"] },
      trim: { materials: ["Bag_Base"] },
    },
    excludedNodes: [],
    // Measured after the yaw below, which is the order the crop reads them in:
    // turned to face the camera the bag is 380mm wide, 612mm to the top of the
    // handles, and 155mm deep.
    frame: [0.515527, 0.830828, 0.209657],
    label: "Tote Bag",
    modelFile: "tote-bag.glb",
    artworkSurface: "print",
    // Front, back, left and right each print their whole side of the bag, fold
    // to fold and base to mouth, the way a sublimated bag is printed rather
    // than a screen-printed one. Each side fills 0 to 1 on its own, so its
    // template is a 1:1 preview of that panel, and each runs left to right as
    // somebody standing in front of that side sees it.
    //
    // The unwrap is written into the file and follows the cloth rather than a
    // plane: how far round the bag a point lies, measured on the bag's own
    // cross-section at that height. A plane cannot hold a fold, and every side
    // here runs round two.
    screenMaterial: "Bag_Front",
    artworkZones: {
      back: { material: "Bag_Back", template: "tote-bag-back.png" },
      front: { template: "tote-bag-front.png" },
      left: { material: "Bag_Left", template: "tote-bag-left.png" },
      right: { material: "Bag_Right", template: "tote-bag-right.png" },
    },
    // The bag's face normal points along X and the camera looks down +Z, so
    // without this it presents its 155mm edge instead of its 380mm face.
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
    // Split by height, which is where the parts actually divide: the body is
    // everything below the thread and the head is the cap that screws onto it.
    excludedNodes: [],
    frame: [0.315724, 0.875884, 0.364891],
    label: "Water Bottle",
    modelFile: "water-bottle.glb",
    artworkSurface: "print",
    artworkFit: "wrap",
    // The body carries one continuous wrap, written into the file rather than
    // computed here: angle around the axis is u, distance along the profile is
    // v, and the join is a single seam at the back. Measured at the widest ring,
    // which is the wall and the only part anyone reads, the wrap is 1.37 to 1,
    // so a design authored at that ratio lands undistorted there.
    //
    // The label is every face on the body that looks away from the axis: the
    // base roll, the wall, the shoulder and the short neck, up to the height
    // where the chrome ring takes over. What is left is `Bottle_Body_Ends` --
    // the disc it stands on and the annulus under the ring, the same coating and
    // never a label. Those two face along the axis the wrap turns about, so
    // their coordinates collapse and their slice of the artwork reads backwards.
    //
    // v is distance along the profile rather than height because the shoulder
    // loses five millimetres of radius over eight of height, so its surface is
    // longer than its height and by height alone its share of the label arrived
    // squeezed into a band.
    screenMaterial: "Bottle_Body",
    artworkZones: { front: { template: "water-bottle-body.png" } },
    // The disc it stands on and the annulus under the ring. They are the same
    // powder coat as the body and they should follow it, but the body is the
    // print zone and a print zone is deliberately never also a colour slot --
    // repainting one would clear the design off it. So they hold the coat's own
    // colour. The alternative was to hang them off the cap's slot, which would
    // have painted the foot of the bottle the colour of its lid.
    fixedMaterials: ["Bottle_Body_Ends"],
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
    // A clipboard, which is what the shape is: a hardboard panel with a nickel
    // spring clip, a writing pad and loose sheets on it, and a pen. It was
    // labelled a folder and dressed as one, which is why every part of it read
    // as the same white slab -- there is no cover, no flap and no spine here to
    // make a folio out of. Each part now carries a tiling map of the material
    // it is actually made of rather than a flat colour and a roughness number.
    //
    // Three slots on the three parts a design never lands on -- the clip is two
    // materials in one slot, because its lever and its jaw lie in different
    // planes and take the brushed map from different axes, which is a fact
    // about the map and not a thing to colour separately. Each slot multiplies
    // its material's map rather than replacing it, so picking a colour stains
    // the board and tints the clip rather than painting the grain and the brush
    // out; all three default to a near-white, which is what leaves the board
    // its own brown and the pen its own dark barrel out of the box.
    colorParts: {
      accent: { materials: ["Folder_Clip", "Folder_Clip_Jaw"] },
      main: { materials: ["Folder_Board"] },
      trim: { materials: ["Folder_Pen"] },
    },
    excludedNodes: [],
    // Measured from the file: 320 by 24.6 by 227mm, over the length of that
    // box, which is what makes this a direction rather than a size. It was
    // 43.97 units long before, and 13 of those were the sheet standing off the
    // end of the board -- so the camera framed a shape a third of which was a
    // part in the wrong place.
    //
    // Landscape, though every photograph of a real clipboard is portrait, and
    // that is not the preference it looks like. Turning it with `yawDegrees:
    // 90` -- which is how the tote is turned, and the frame for it is
    // [0.577612, 0.062585, 0.813908] -- makes the clip vanish from the render
    // at every camera angle tried, while the board, the sheet and the pen all
    // still draw. The clip is in the file either way: 220 lever triangles at
    // x -143.4..-117.7, and it draws correctly at yaw 0. So the turn is held
    // back until that is understood rather than shipped with a part missing.
    frame: [0.813908, 0.062585, 0.577612],
    label: "Clipboard",
    modelFile: "tablet-folder.glb",
    artworkSurface: "print",
    // The face of the sheet, which is what a clipboard is a mockup of. Two
    // triangles projected straight down onto it and flattened, filling 0 to 1.
    // The sheet is cut to A4 at prep time -- 297 by 210mm on a 320 by 227mm
    // board -- so a design authored at 1:1.414 lands undistorted and the print
    // area is a paper size rather than whatever the bought file happened to
    // draw. Its four edges are their own material: they stand square to the
    // face, and unwrapping them with it would smear the design down the side of
    // the block.
    screenMaterial: "Folder_Pad",
    // Paper, and paper-coloured. Not a slot, because the cut edge of a stack of
    // paper is not a part anyone would want to paint a different colour from
    // the sheet on top of it.
    fixedMaterials: ["Folder_Pad_Edge"],
  },
} satisfies Readonly<Record<string, DeviceDefinition>>;
