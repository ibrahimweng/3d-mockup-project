import { defineToolcraft } from "@/toolcraft/runtime";

import { ENVIRONMENT_OPTIONS, FIT_OPTIONS } from "./product-domain";

// `identity` is intentionally omitted. The signed starter ships an
// `app-identity.ts` naming the app this folder was generated from, and that
// file is covered by the integrity manifest, so it cannot be renamed here. The
// runtime falls back to the controls title, which resolves the id `plinth`.
export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    renderScale: true,
    size: { height: 1350, unit: "px", width: 1080 },
    sizing: { mode: "editable-output" },
    upload: true,
  },
  panels: {
    controls: {
      sections: [
        {
          controls: {
            image: {
              accept: "image/png,image/jpeg,image/webp",
              applicability: { mode: "always" },
              assetKind: "image",
              defaultValue: null,
              description:
                "Shown on the phone's display. A portrait image matching the screen's proportions fills it exactly.",
              label: "Screenshot",
              multiple: false,
              performanceReason:
                "The screenshot is decoded once into a texture and swapped onto the display material; it does not affect per-frame cost.",
              performanceRole: "responsiveness",
              target: "artwork.image",
              type: "fileDrop",
            },
            fit: {
              applicability: { mode: "always" },
              defaultValue: "fill",
              description:
                "Fit shows the whole image and leaves margins. Fill covers the screen and crops. Stretch distorts to fit exactly.",
              label: "Fit mode",
              options: FIT_OPTIONS,
              performanceReason:
                "Fit recomputes the display texture's repeat and offset; no geometry or lighting is rebuilt.",
              performanceRole: "responsiveness",
              target: "artwork.fit",
              type: "segmented",
            },
            offset: {
              applicability: { mode: "always" },
              defaultValue: { x: 0.5, y: 0.5 },
              description:
                "Slides the image behind the screen. Only has an effect once the image is larger than the display and something is being cropped.",
              label: "Screen position",
              performanceReason:
                "Position writes the display texture's offset and redraws one frame.",
              performanceRole: "responsiveness",
              target: "artwork.offset",
              type: "vector",
            },
            scale: {
              applicability: { mode: "always" },
              defaultValue: 100,
              label: "Screen scale",
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
            stretch: {
              applicability: { mode: "always" },
              defaultValue: { x: 0.5, y: 0.5 },
              description:
                "Independent width and height. Centre is unstretched; moving an axis squashes or extends the image along it.",
              label: "Screen stretch",
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
            environment: {
              applicability: { mode: "always" },
              defaultValue: "studio-soft",
              description:
                "The captured studio the phone is lit by and reflects. This is the whole lighting model — there are no separate lights to place.",
              label: "Environment",
              options: ENVIRONMENT_OPTIONS,
              performanceReason:
                "Switching environment reloads and re-convolves one image-based lighting texture; frames themselves are unaffected.",
              performanceRole: "responsiveness",
              target: "studio.environment",
              type: "select",
            },
          },
          id: "studio",
          title: "Studio",
        },
        {
          controls: {
            focalLength: {
              applicability: { mode: "always" },
              defaultValue: 85,
              description:
                "Full-frame equivalent. Longer lenses flatten perspective the way product photography does; wider ones exaggerate the phone's depth.",
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
            { columns: 2, controls: ["format", "resolution"], layout: "inline" },
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
      title: "Plinth",
    },
  },
  toolbar: {
    history: true,
    radar: true,
    zoom: true,
  },
});
