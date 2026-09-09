import { onTab } from "./panel-tabs";

/**
 * How the picture leaves: a still, a clip, and the buttons that write them.
 *
 * Kept out of `app-schema.ts` for the same reason the colour slots and the
 * artwork are: that file was past the line budget generated app source is held
 * to, and a section is a self-contained thing the schema can name rather than
 * something it has to spell out.
 */

export const IMAGE_EXPORT_SECTION = {
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
          visibleWhen: onTab("output"),
        } as const;

export const VIDEO_EXPORT_SECTION = {
          controls: {
            format: {
              applicability: { mode: "always" },
              defaultValue: "mp4",
              label: "Format",
              options: [
                { label: "MP4", value: "mp4" },
                { label: "WebM", value: "webm" },
              ],
              performanceReason:
                "The container only selects how the encoded frames are wrapped when an export runs.",
              performanceRole: "responsiveness",
              target: "export.video.format",
              type: "select",
            },
            motionBlur: {
              applicability: { mode: "always" },
              defaultValue: false,
              description:
                "Whether each exported frame covers the slice of time it stands for, the way a camera's shutter does. Off, every frame is a single sharp instant, and quick motion reads as a stack of stills played fast rather than as something filmed. On, a frame that moves is smeared across its own shutter. It costs: a blurred frame is drawn eight times instead of once, so a clip takes roughly eight times as long to write. Frames where nothing moves cost nothing extra.",
              label: "Motion blur",
              performanceReason:
                "Motion blur only decides how many times each frame is drawn when an export runs; the preview still draws one frame per change.",
              performanceRole: "responsiveness",
              target: "export.video.motionBlur",
              type: "switch",
            },
            shutterAngle: {
              applicability: {
                all: [{ equals: true, target: "export.video.motionBlur" }],
                mode: "conditional",
              },
              defaultValue: "180",
              description:
                "How much of each frame the shutter is open for. 360 degrees is open for the whole frame and blurs the most; 180 is the film convention and what most footage you have seen was shot at; smaller angles are crisper and more strobed. A short list rather than a dial because these are the angles a camera actually offers, and because a shutter is a property of the export rather than of the scene -- a slider here would carry a keyframe diamond for something no frame of the animation can sensibly differ on.",
              label: "Shutter angle",
              options: [
                { label: "90°", value: "90" },
                { label: "180°", value: "180" },
                { label: "270°", value: "270" },
                { label: "360°", value: "360" },
              ],
              performanceReason:
                "The shutter angle only widens the span each frame is sampled across when an export runs; the number of samples does not change and the preview is untouched.",
              performanceRole: "responsiveness",
              target: "export.video.shutterAngle",
              type: "select",
            },
            resolution: {
              applicability: { mode: "always" },
              defaultValue: "current",
              /**
               * Smaller than the image ceiling, deliberately.
               *
               * A still is one frame and can afford eight thousand pixels. A
               * six-second loop is a hundred and eighty of them, so the same
               * ceiling would be a hundred and eighty times the work; 4K is as
               * far as that scales while an export still finishes.
               */
              label: "Resolution",
              options: [
                { label: "Canvas size", value: "current" },
                { label: "4K", value: "4k" },
              ],
              performanceReason:
                "The export resolution only selects the output size used when an export runs.",
              performanceRole: "responsiveness",
              target: "export.video.resolution",
              type: "select",
            },
          },
          id: "video-export",
          layoutGroups: [
            {
              columns: 2,
              controls: ["format", "resolution"],
              layout: "inline",
            },
          ],
          title: "Video Export",
          visibleWhen: onTab("output"),
        } as const;

export const DELIVER_SECTION = {
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
                {
                  icon: "download-simple",
                  label: "Export Video",
                  role: "export-video",
                  value: "export-video",
                },
              ],
              label: false,
              target: "panel.actions",
              type: "panelActions",
            },
          },
          id: "deliver",
          title: "Deliver",
        } as const;
