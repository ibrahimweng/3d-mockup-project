import { defineToolcraft } from "@/toolcraft/runtime";

import { appIdentity } from "./app-identity";
import {
  DEFAULT_DEVICE,
  DEVICE_OPTIONS,
  ENVIRONMENT_OPTIONS,
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
            environment: {
              applicability: { mode: "always" },
              defaultValue: "studio-soft",
              description:
                "The captured studio the device is lit by and reflects. This is the whole lighting model — there are no separate lights to place.",
              label: "Environment",
              options: ENVIRONMENT_OPTIONS,
              performanceReason:
                "Switching environment reloads and re-convolves one image-based lighting texture; frames themselves are unaffected.",
              performanceRole: "responsiveness",
              target: "studio.environment",
              type: "select",
            },
            intensity: {
              applicability: { mode: "always" },
              defaultValue: 100,
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
              defaultValue: 110,
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
              defaultValue: 30,
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
              defaultValue: 0,
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
          },
          id: "lights",
          title: "Lights",
        },
        {
          controls: {
            keyDirection: {
              applicability: { mode: "always" },
              defaultValue: { x: 0.5, y: 0.5 },
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
              defaultValue: { position: [0.3, 0.2, 1], up: [0, 1, 0] },
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
            color: {
              applicability: {
                all: [{ equals: true, target: "export.includeBackground" }],
                mode: "conditional",
              },
              defaultValue: "#0d0d10",
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
