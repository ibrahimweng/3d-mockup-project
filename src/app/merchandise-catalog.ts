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
    // sleeve heads that colour and left every printed panel on the background,
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
    // seam, and each sleeve round the tube from the cuff to the underarm curve.
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
    // sleeve heads and the facings: everything a print stops at.
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
    // Prepped like every other product now, so the file says what the parts are
    // instead of the catalog correcting them on the way to the screen. The
    // source paints all five with one material at metallic 1 and roughness 1 --
    // which renders near black -- and hangs a photograph of somebody's document
    // off it. Colour slots and a material correction rescued three of the five;
    // the loose sheets were left, and shipped that artwork in plain view.
    colorParts: {
      accent: { materials: ["Folder_Clip"] },
      main: { materials: ["Folder_Board"] },
      trim: { materials: ["Folder_Pen"] },
    },
    excludedNodes: [],
    // Measured from the file: 43.97 by 1.85 by 23.74 units. It read
    // [0.793326, 0.040254, 0.607464] before, which is not this model -- the
    // camera stood as if the folio were narrower and deeper than it is, and the
    // folio ran off the right of the canvas and under the controls panel.
    frame: [0.879361, 0.036983, 0.474717],
    label: "Tablet Folder",
    modelFile: "tablet-folder.glb",
    artworkSurface: "print",
    // The top of the pad: the largest flat face, and the one the folio is a
    // mockup of. Two triangles projected straight down onto it, filling 0 to 1,
    // so a design at 1.33 to 1 lands undistorted. Its four edges are their own
    // material -- they stand square to the face and unwrapping them with it
    // would smear the design down the side of the block. The loose sheets are
    // `Folder_Sheet`, plain paper and not a slot.
    screenMaterial: "Folder_Pad",
    // Paper, and paper-coloured. The four edges of the pad stand square to its
    // face, so they are not part of the print; the loose sheets are not the pad
    // a design lands on. Neither is a slot, because neither is a part anyone
    // would want to paint a different colour from the paper beside it.
    fixedMaterials: ["Folder_Pad_Edge", "Folder_Sheet"],
  },
} satisfies Readonly<Record<string, DeviceDefinition>>;
