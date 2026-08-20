import { defineToolcraft } from "@/toolcraft/runtime";

import { appIdentity } from "./app-identity";
import {
  DEFAULT_LIGHT_PATTERN,
  DEFAULT_SURFACE,
  LIGHT_PATTERN_OPTIONS,
  SURFACE_DEVICES,
  SURFACE_OPTIONS,
} from "./product-domain";
import { DEFAULT_SCENE_PRESET, SCENE_PRESET_OPTIONS } from "./scene-presets";
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
              target: "device.finish",
              type: "select",
            },
          },
          id: "device",
          title: "Device",
        },
        {
          controls: {
            image: {
              accept: "image/png,image/jpeg,image/webp",
              applicability: { mode: "always" },
              assetKind: "image",
              defaultValue: null,
              description:
                "Shown on the device's display. An image matching the screen's proportions fills it exactly.",
              label: false,
              multiple: false,
              performanceReason:
                "The screenshot is decoded once into a texture and swapped onto the display material; it does not affect per-frame cost.",
              performanceRole: "responsiveness",
              target: "artwork.image",
              type: "fileDrop",
            },
            offset: {
              applicability: { mode: "always" },
              defaultValue: { x: 0.5, y: 0.5 },
              description:
                "Slides the image behind the screen. Only has an effect once the image is larger than the display and something is being cropped.",
              label: "Position",
              performanceReason:
                "Position writes the display texture's offset and redraws one frame.",
              performanceRole: "responsiveness",
              target: "artwork.offset",
              type: "vector",
            },
            stretch: {
              applicability: { mode: "always" },
              defaultValue: { x: 0.5, y: 0.5 },
              description:
                "Independent width and height. Centre is unstretched; moving an axis squashes or extends the image along it.",
              label: "Stretch",
              performanceReason:
                "Stretch writes the display texture's repeat and redraws one frame.",
              performanceRole: "responsiveness",
              target: "artwork.stretch",
              type: "vector",
            },
          },
          id: "artwork",
          title: "Screenshot",
        },
        {
          controls: {
            fit: {
              applicability: { mode: "always" },
              defaultValue: "fill",
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
        {
          controls: {
            keyIntensity: {
              applicability: { mode: "always" },
              defaultValue: 95,
              description:
                "The one shadow-casting light. A second caster reads as two suns, which is what gives a render away.",
              label: "Key",
              max: 400,
              min: 0,
              performanceReason:
                "Light intensity is a uniform; the shadow map is already allocated.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 5,
              target: "light.keyIntensity",
              type: "slider",
              unit: "%",
            },
            keyColor: {
              applicability: { mode: "always" },
              defaultValue: "#FFFFFF",
              description:
                "Warm the key towards tungsten or cool it towards daylight to sit the device in a room.",
              label: "Key color",
              performanceReason: "The key's colour is one uniform.",
              performanceRole: "responsiveness",
              target: "light.keyColor",
              type: "color",
            },
            fill: {
              applicability: { mode: "always" },
              defaultValue: 10,
              description:
                "Bounce from below, lifting the shadow side. It casts nothing, because bounce has no edge.",
              label: "Fill",
              max: 200,
              min: 0,
              performanceReason: "Fill is a hemisphere light with no shadow map.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 5,
              target: "light.fill",
              type: "slider",
              unit: "%",
            },
            rim: {
              applicability: { mode: "always" },
              defaultValue: 85,
              description:
                "A hard edge from behind that separates the device from the backdrop.",
              label: "Rim",
              max: 400,
              min: 0,
              performanceReason: "Rim is a second directional light with no shadow map.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 5,
              target: "light.rim",
              type: "slider",
              unit: "%",
            },
            shadowSoftness: {
              applicability: { mode: "always" },
              defaultValue: 34,
              description:
                "How wide the key's shadow spreads. This is the size of the light, told through the only thing that shows it: a bare bulb is a point and throws an edge you could cut around, a large softbox throws one that takes a hand's width to fade. Low is graphic and hard; high is the shadow you get on an overcast day.",
              label: "Shadow softness",
              max: 100,
              min: 0,
              performanceReason:
                "A blur radius, and below a third of the range a depth map twice the size that is only redrawn when the scene changes.",
              performanceRole: "responsiveness",
              sliderValueKind: "continuous",
              step: 2,
              target: "light.shadowSoftness",
              type: "slider",
              unit: "%",
            },
            pattern: {
              applicability: { mode: "always" },
              defaultValue: DEFAULT_LIGHT_PATTERN,
              description:
                "A cut-out held in front of the key, so what lands has a shape. Bars of shadow across a floor read as a window or a slatted blind without either being in the frame — it is the cheapest way to put the device somewhere rather than nowhere. The pattern falls around the device rather than across it.",
              label: "Pattern",
              options: LIGHT_PATTERN_OPTIONS,
              performanceReason:
                "A dozen invisible quads in the depth pass, which is redrawn on change rather than per frame.",
              performanceRole: "responsiveness",
              target: "light.pattern",
              type: "select",
            },
          },
          id: "lights",
          title: "Lights",
        },
        {
          controls: {
            keyDirection: {
              applicability: { mode: "always" },
              defaultValue: { x: 0.72, y: 0.24 },
              description:
                "Where the key sits relative to the camera. Centre is straight on; move it off centre to rake the light across the device and lengthen the shadow.",
              label: false,
              performanceReason:
                "Moving the key repositions one light and redraws a frame.",
              performanceRole: "responsiveness",
              target: "light.keyDirection",
              type: "vector",
            },
          },
          id: "key-light-direction",
          title: "Key light direction",
        },
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
        {
          controls: {
            format: {
              applicability: { mode: "always" },
              defaultValue: "png",
              label: "Format",
              options: [
                { label: "PNG", value: "png" },
                { label: "JPG", value: "jpg" },
              ],
              performanceReason:
                "The export format only selects the encoder used when an export runs.",
              performanceRole: "responsiveness",
              target: "export.image.format",
              type: "select",
            },
            resolution: {
              applicability: { mode: "always" },
              defaultValue: "4k",
              label: "Resolution",
              options: [
                { label: "2K", value: "2k" },
                { label: "4K", value: "4k" },
                { label: "8K", value: "8k" },
              ],
              performanceReason:
                "The export resolution only selects the output size used when an export runs.",
              performanceRole: "responsiveness",
              target: "export.image.resolution",
              type: "select",
            },
          },
          id: "image-export",
          layoutGroups: [
            {
              columns: 2,
              controls: ["format", "resolution"],
              layout: "inline",
            },
          ],
          title: "Image Export",
        },
        {
          controls: {
            footer: {
              applicability: { mode: "always" },
              actions: [
                {
                  icon: "upload-simple",
                  label: "Export PNG",
                  role: "export-image",
                  value: "export-png",
                },
              ],
              label: false,
              target: "panel.actions",
              type: "panelActions",
            },
          },
          id: "deliver",
          title: "Deliver",
        },
      ],
      title: "Mockup Studio",
    },
  },
  toolbar: {
    history: true,
    radar: true,
    zoom: true,
  },
});
