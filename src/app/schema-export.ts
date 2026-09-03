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
