import { defineToolcraft } from "@/toolcraft/runtime";

import { appIdentity } from "./app-identity";
import {
  DEFAULT_LIGHT_PATTERN,
  LIGHT_PATTERN_OPTIONS,
} from "./product-domain";
import { SURFACE_DEVICES } from "./product-applicability";
import {
  ARTWORK_SECTION,
  ARTWORK_TEMPLATES_SECTION,
} from "./schema-artwork";
import {
  DELIVER_SECTION,
  IMAGE_EXPORT_SECTION,
  VIDEO_EXPORT_SECTION,
} from "./schema-export";
import { KEY_LIGHT_SECTION, LIGHTS_SECTION } from "./schema-lighting";
import { PRODUCT_PARTS_SECTION } from "./schema-product-parts";
import { DEFAULT_SCENE_PRESET, SCENE_PRESET_OPTIONS } from "./scene-presets";
import { DEFAULT_SURFACE, SURFACE_OPTIONS } from "./surfaces";
import {
  DEFAULT_DEVICE,
  DEFAULT_FINISH,
  DEVICE_OPTIONS,
  ENVIRONMENT_OPTIONS,
  FINISH_OPTIONS,
  FIT_OPTIONS,
} from "./product-domain";

export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    renderScale: true,
    size: { height: 1350, unit: "px", width: 1080 },
    sizing: { mode: "editable-output" },
    upload: true,
  },
  identity: appIdentity,
  panels: {
    controls: {
      sections: [
        {
          controls: {
            model: {
              applicability: { mode: "always" },
              defaultValue: DEFAULT_DEVICE,
              description:
                "Which product the screenshot is shown on. Each is a separate model, so switching reloads the scene and reframes the camera around the new subject.",
              label: false,
              options: DEVICE_OPTIONS,
              performanceReason:
                "Switching device decodes a different GLB once and reframes the camera; frames themselves stay one constant-cost raster pass.",
              performanceRole: "responsiveness",
              semanticGroup: "identity",
              target: "device.model",
              type: "select",
            },
            finish: {
              applicability: { mode: "always" },
              defaultValue: DEFAULT_FINISH,
              description:
                "Repaints the device's own body materials. Natural is the model exactly as its author built it; the rest keep the same brushed or polished surface and change only its colour.",
              label: "Finish",
              options: FINISH_OPTIONS,
              performanceReason:
                "A finish rewrites base colours on the loaded model; it does not re-decode geometry or re-convolve the environment.",
              performanceRole: "responsiveness",
              semanticGroup: "identity",
              target: "device.finish",
              type: "select",
            },
            spin: {
              applicability: { mode: "always" },
              defaultValue: 0,
              description:
                "Turn the device on the spot, about its own upright axis. Separate from dragging the canvas, which moves the camera around a standing subject: this turns the subject while the camera holds still, which is what makes a turntable read as the object rotating rather than the room. Keyframe it to animate; two keyframes a revolution apart give a constant turn.",
              label: "Spin",
              max: 360,
              min: -360,
              performanceReason:
                "Spin rotates the subject and redraws one frame; the model, its materials and the environment are untouched.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 1,
              semanticGroup: "rotation",
              target: "device.spin",
              type: "slider",
              unit: "\u00b0",
            },
            tilt: {
              applicability: { mode: "always" },
              defaultValue: 0,
              description:
                "Pitch the device forward or back, as though tipping the top of it towards the camera. Spin turns it on the spot; this leans it.",
              label: "Tilt",
              max: 90,
              min: -90,
              performanceReason:
                "Tilt rotates the subject and redraws one frame; the model, its materials and the environment are untouched.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 1,
              semanticGroup: "rotation",
              target: "device.tilt",
              type: "slider",
              unit: "\u00b0",
            },
            roll: {
              applicability: { mode: "always" },
              defaultValue: 0,
              description:
                "Cant the device sideways, the way a hand holds a phone off square. Small amounts read as a casual angle; ninety degrees lays it flat on its side.",
              label: "Roll",
              max: 180,
              min: -180,
              performanceReason:
                "Roll rotates the subject and redraws one frame; the model, its materials and the environment are untouched.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 1,
              semanticGroup: "rotation",
              target: "device.roll",
              type: "slider",
              unit: "\u00b0",
            },
            positionX: {
              applicability: { mode: "always" },
              defaultValue: 0,
              description:
                "Slide the device across the set, left or right of centre. Measured against the device's own size, so the same number places any model the same way.",
              label: "Position X",
              max: 200,
              min: -200,
              performanceReason:
                "Position moves the subject and redraws one frame; the model, its materials and the environment are untouched.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 1,
              semanticGroup: "placement",
              target: "device.positionX",
              type: "slider",
              unit: "%",
            },
            positionY: {
              applicability: { mode: "always" },
              defaultValue: 0,
              description:
                "Lift the device off the floor or sink it into one. Zero stands it on the surface it belongs on, whether that is the ground or a table top.",
              label: "Position Y",
              max: 200,
              min: -200,
              performanceReason:
                "Position moves the subject and redraws one frame; the model, its materials and the environment are untouched.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 1,
              semanticGroup: "placement",
              target: "device.positionY",
              type: "slider",
              unit: "%",
            },
            positionZ: {
              applicability: { mode: "always" },
              defaultValue: 0,
              description:
                "Move the device towards the camera or back into the set. Nearer reads larger and throws its shadow further behind it.",
              label: "Position Z",
              max: 200,
              min: -200,
              performanceReason:
                "Position moves the subject and redraws one frame; the model, its materials and the environment are untouched.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 1,
              semanticGroup: "placement",
              target: "device.positionZ",
              type: "slider",
              unit: "%",
            },
            scale: {
              applicability: { mode: "always" },
              defaultValue: 100,
              description:
                "Resize the device without moving the camera. It grows from its feet rather than its middle, so it stays standing on the surface as it changes size.",
              label: "Scale",
              max: 400,
              min: 25,
              performanceReason:
                "Scale resizes the subject and redraws one frame; the model, its materials and the environment are untouched.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 1,
              semanticGroup: "placement",
              target: "device.scale",
              type: "slider",
              unit: "%",
            },
          },
          id: "device",
          title: "Device",
        },
        PRODUCT_PARTS_SECTION,
        ARTWORK_SECTION,
        ARTWORK_TEMPLATES_SECTION,
        {
          controls: {
            fit: {
              applicability: { mode: "always" },
              // Fit, because a printer does not crop your artwork and does not
              // stretch it. Fill silently cut the edges off anything not
              // authored to the zone's shape, which on a 0.63 to 1 card is most
              // uploads, and the loss is invisible until the proof comes back.
              defaultValue: "fit",
              description:
                "Fit shows the whole image and leaves margins. Fill covers the screen and crops. Stretch distorts to fit exactly.",
              label: "Mode",
              options: FIT_OPTIONS,
              performanceReason:
                "Fit recomputes the display texture's repeat and offset; no geometry or lighting is rebuilt.",
              performanceRole: "responsiveness",
              target: "artwork.fit",
              type: "segmented",
            },
            scale: {
              applicability: { mode: "always" },
              defaultValue: 100,
              label: "Scale",
              max: 300,
              min: 25,
              performanceReason:
                "Scale writes the display texture's repeat and redraws one frame.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 1,
              target: "artwork.scale",
              type: "slider",
              unit: "%",
            },
          },
          id: "screen-fit",
          title: "Screen fit",
        },
        {
          controls: {
            preset: {
              applicability: { mode: "always" },
              defaultValue: DEFAULT_SCENE_PRESET,
              description:
                "A backdrop, a floor, a light rig and a framing, set together. Everything it writes stays editable below — this is a starting point, not a mode.",
              label: "Environment",
              options: SCENE_PRESET_OPTIONS,
              performanceReason:
                "Choosing one writes a dozen control values in a single history entry; the scene absorbs them without rebuilding the model.",
              performanceRole: "responsiveness",
              target: "studio.preset",
              type: "select",
            },
            environment: {
              applicability: { mode: "always" },
              defaultValue: "studio-soft",
              description:
                "The captured room the device reflects. A polished floor mirrors this before it mirrors anything else, so a bright capture lifts the whole scene.",
              label: "Capture",
              options: ENVIRONMENT_OPTIONS,
              performanceReason:
                "Switching environment reloads and re-convolves one image-based lighting texture; frames themselves are unaffected.",
              performanceRole: "responsiveness",
              target: "studio.environment",
              type: "select",
            },
            intensity: {
              applicability: { mode: "always" },
              defaultValue: 80,
              description:
                "How strongly the captured studio itself lights the device. Lower it to let the placed lights below do more of the work.",
              label: "Environment",
              max: 300,
              min: 0,
              performanceReason:
                "Environment intensity is one scene-level scalar; the convolved texture is reused.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 5,
              target: "studio.intensity",
              type: "slider",
              unit: "%",
            },
          },
          id: "studio",
          title: "Studio",
        },
        LIGHTS_SECTION,
        KEY_LIGHT_SECTION,
        {
          controls: {
            focalLength: {
              applicability: { mode: "always" },
              defaultValue: 85,
              description:
                "Full-frame equivalent. Longer lenses flatten perspective the way product photography does; wider ones exaggerate the device's depth.",
              label: "Focal length",
              max: 200,
              min: 24,
              performanceReason:
                "Focal length updates the camera's projection matrix only.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 1,
              target: "camera.focalLength",
              type: "slider",
              unit: "mm",
            },
            zoom: {
              applicability: { mode: "always" },
              defaultValue: 100,
              description:
                "How much of the frame the subject fills. The camera stays where the framing put it and the picture is cropped instead, so this changes the size of things and nothing else — perspective is the focal length's job. At 100 everything in the scene is in frame, including the table it is standing on; past that it crops in, which is how a tight shot of the device is got.",
              label: "Zoom",
              max: 260,
              min: 40,
              performanceReason:
                "Zoom scales the camera's projection matrix and redraws one frame.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 1,
              target: "camera.zoom",
              type: "slider",
              unit: "%",
            },
            orbit: {
              applicability: { mode: "always" },
              defaultValue: { position: [-0.36, 0.14, 1], up: [0, 1, 0] },
              keyframeable: false,
              label: false,
              performanceReason:
                "Orbiting moves the camera and redraws one frame; nothing is rebuilt and nothing has to re-converge.",
              performanceRole: "responsiveness",
              target: "camera.orbit",
              type: "orientationGizmo",
            },
          },
          id: "camera",
          title: "Camera",
        },
        {
          controls: {
            framing: {
              applicability: { mode: "always" },
              defaultValue: { x: 0, y: 0 },
              description:
                "Where the subject sits in the picture. Centre is centred; move it off centre to leave room beside the device for a headline. The projection is shifted rather than the camera swung, the way a shift lens works, so nothing leans as it moves.",
              label: false,
              performanceReason:
                "A framing offset shifts the camera's projection matrix and redraws one frame.",
              performanceRole: "responsiveness",
              target: "camera.framing",
              type: "vector",
            },
          },
          id: "framing",
          title: "Framing",
        },
        {
          controls: {
            kind: {
              applicability: {
                all: [
                  { equals: true, target: "export.includeBackground" },
                  // Only the devices the catalog gives a table. Offering the
                  // control everywhere and quietly ignoring it on two of the
                  // five would be worse than not offering it: a control that
                  // does nothing teaches people not to trust the panel.
                  { oneOf: SURFACE_DEVICES, target: "device.model" },
                ],
                mode: "conditional",
              },
              defaultValue: DEFAULT_SURFACE,
              description:
                "What the device is standing on. None leaves the endless floor, which is right for a backdrop and is exactly why it can never be furniture — a table is defined by the thing a sweep exists to hide, an edge with a lit top on one side and a shaded face on the other. Offered only for the devices a table flatters; a watch on a desk is a watch photographed from too far away.",
              // The section is already titled Surface, and a control repeating
              // its own section reads as a form rather than a panel.
              label: false,
              options: SURFACE_OPTIONS,
              performanceReason:
                "Swaps the floor plane for a slab of a dozen vertices.",
              performanceRole: "responsiveness",
              target: "surface.kind",
              type: "select",
            },
          },
          id: "surface",
          title: "Surface",
        },
        {
          controls: {
            height: {
              applicability: {
                all: [{ equals: true, target: "export.includeBackground" }],
                mode: "conditional",
              },
              defaultValue: 0,
              description:
                "How far the backdrop rises behind the device. At zero there is a floor and nothing else, which is what a device floating in the dark wants. Raised, the floor curves up into a wall — the seamless paper a studio actually shoots against, which catches the key, graduates on its own and gives the device something to sit in front of.",
              label: "Sweep height",
              max: 100,
              min: 0,
              performanceReason:
                "Rebuilds a hundred-vertex strip and draws it once.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 2,
              target: "backdrop.height",
              type: "slider",
              unit: "%",
            },
            curve: {
              applicability: {
                all: [{ equals: true, target: "export.includeBackground" }],
                mode: "conditional",
              },
              defaultValue: 45,
              description:
                "How wide the bend is where the floor becomes the wall. A tight bend reads as a corner and puts a line across the frame; a broad one turns away from the light gradually, which is where the graduation from bright to dark comes from.",
              label: "Sweep curve",
              max: 100,
              min: 0,
              performanceReason:
                "Rebuilds a hundred-vertex strip and draws it once.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 2,
              target: "backdrop.curve",
              type: "slider",
              unit: "%",
            },
            light: {
              applicability: {
                all: [{ equals: true, target: "export.includeBackground" }],
                mode: "conditional",
              },
              defaultValue: 0,
              description:
                "A lamp aimed at the backdrop rather than the device. It is the only light here that weakens with distance, which is why it is the only one that can graduate anything: the key and the fill arrive as parallel rays and leave a large surface one flat tone. With a sweep raised it sits at the foot of the paper and washes it from the bottom up; with no sweep it hangs overhead and lays a pool of light on the floor that falls away to nothing.",
              label: "Backdrop light",
              max: 100,
              min: 0,
              performanceReason: "One more light in the same shader.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 2,
              target: "backdrop.light",
              type: "slider",
              unit: "%",
            },
            environment: {
              applicability: {
                all: [{ equals: true, target: "export.includeBackground" }],
                mode: "conditional",
              },
              defaultValue: 6,
              description:
                "How much of the captured room the floor picks up. The device wants a bright capture to read as metal, but the floor is large and seen edge-on, where every surface returns most of what falls on it — so the same capture that flatters the device washes the floor to grey. Lower this to keep a dark floor dark without dimming the device.",
              label: "Room light",
              max: 100,
              min: 0,
              performanceReason: "One material uniform.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 2,
              target: "floor.environment",
              type: "slider",
              unit: "%",
            },
            reflection: {
              applicability: {
                all: [{ equals: true, target: "export.includeBackground" }],
                mode: "conditional",
              },
              defaultValue: 40,
              description:
                "How much of the device the floor carries back. The device is drawn a second time beneath the floor and fades with distance, which is what a polished surface does.",
              label: "Reflection",
              max: 100,
              min: 0,
              performanceReason:
                "Above zero the device is drawn once more, mirrored: one extra pass over geometry already uploaded, with no second scene traversal and no render target.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 5,
              target: "floor.reflection",
              type: "slider",
              unit: "%",
            },
            roughness: {
              applicability: {
                all: [{ equals: true, target: "export.includeBackground" }],
                mode: "conditional",
              },
              defaultValue: 88,
              description:
                "Floor finish, from polished to matte. A polished floor mirrors the captured room as well as the device.",
              label: "Roughness",
              max: 100,
              min: 0,
              performanceReason: "One material uniform.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 2,
              target: "floor.roughness",
              type: "slider",
              unit: "%",
            },
          },
          id: "backdrop",
          title: "Backdrop",
        },
        {
          controls: {
            color: {
              applicability: {
                all: [{ equals: true, target: "export.includeBackground" }],
                mode: "conditional",
              },
              defaultValue: "#000000",
              label: "Background color",
              performanceReason:
                "The ground colour is one material uniform and repaints instantly.",
              performanceRole: "responsiveness",
              target: "scene.background",
              type: "color",
            },
            include: {
              applicability: { mode: "always" },
              defaultValue: true,
              label: "Background",
              performanceReason:
                "Including the ground toggles one mesh in preview and export composition.",
              performanceRole: "responsiveness",
              target: "export.includeBackground",
              type: "switch",
            },
          },
          id: "background",
          title: "Background",
        },
        IMAGE_EXPORT_SECTION,
        VIDEO_EXPORT_SECTION,
        DELIVER_SECTION,
      ],
      title: "Mockup Studio",
    },
    /**
     * Six seconds, because that is one unhurried revolution.
     *
     * The animation this product exists to make is a turntable, and the length
     * of a turntable loop is the length of one turn. Six seconds reads as
     * deliberate rather than frantic at a full 360, and it divides evenly into
     * the thirtieth-of-a-second frames a video export is cut into.
     */
    timeline: {
      /**
       * The turn, as one press.
       *
       * Keying it by hand is four steps — key the angle at the start, move the
       * playhead to the end, change the angle, come back — for the animation
       * this product exists to make. A full revolution over the whole loop is
       * what a turntable is, so that is what the preset lays down.
       */
      animations: [
        {
          id: "turntable",
          label: "Turntable",
          tracks: [
            {
              controlLabel: "Spin",
              // Linear, and this is the whole reason the track can say so. The
              // editor's default easing is a strong ease-in-out, which is right
              // for a move that starts and stops and wrong for one that loops:
              // eased at both ends the device accelerates away, slows to a dead
              // stop at the top of the revolution, and jerks as the loop
              // repeats. A turntable turns at one speed, which is exactly what
              // this control's own description promises.
              easing: { controlPoints: [0, 0, 1, 1], type: "bezier" },
              from: 0,
              target: "device.spin",
              to: 360,
            },
          ],
        },
      ],
      defaultDurationSeconds: 6,
      enabled: true,
      mode: "keyframes",
    },
  },
  toolbar: {
    history: true,
    radar: true,
    zoom: true,
  },
});
