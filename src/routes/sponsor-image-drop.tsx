import * as React from "react";

import { Button } from "@/toolcraft/ui/components/primitives";
import {
  maxImageBytes,
  supportedImageTypes,
} from "@/sponsor/sponsor-image";

/**
 * How the sponsor's logo gets into the page: dropped on, or pasted in.
 *
 * There is no file picker button, and that is a rule rather than a taste. This
 * repository's product boundary refuses a native `<input type="file">` in
 * product source, because a file input is how a Toolcraft app would smuggle in
 * its own upload pipeline instead of declaring a `fileDrop` control. That rule
 * is about the studio's own controls and there is no schema out here on an
 * admin page to declare one in, so the way through is not to argue with the
 * check but to not need it: a drop target and a paste handler take a file
 * without a file input existing.
 *
 * Both, not one. A drop target on its own is a control that cannot be reached
 * without a mouse, and the logo usually arrives in an email, where copying the
 * image is already what somebody is doing. The box is a focus stop, so the
 * keyboard route is Tab to it and press paste.
 *
 * The bytes are read here and posted as a `data:` URL. Nothing is checked here
 * that matters: the size, the type and whether the bytes are really an image of
 * that type are all decided again inside the endpoint, because a check that
 * runs in a browser is a check anyone can skip. What runs here runs so the
 * answer is immediate rather than a round trip.
 */

function isSupported(file: File): boolean {
  return supportedImageTypes.includes(file.type);
}

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

export function SponsorImageDrop({
  dataUrl,
  onChange,
  onProblem,
}: {
  dataUrl: string;
  onChange: (dataUrl: string) => void;
  onProblem: (message: string) => void;
}): React.JSX.Element {
  const [over, setOver] = React.useState(false);

  const take = React.useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!isSupported(file)) {
        onProblem("Use a PNG, a JPEG or a WebP.");
        return;
      }
      if (file.size > maxImageBytes) {
        onProblem(`Keep the image under ${Math.round(maxImageBytes / 1_024)} KB.`);
        return;
      }
      try {
        onChange(await readAsDataUrl(file));
        onProblem("");
      } catch {
        onProblem("That file could not be read.");
      }
    },
    [onChange, onProblem],
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        aria-label="Sponsor logo. Drop an image here, or focus this box and paste one."
        className={`flex min-h-24 items-center justify-center rounded-lg border border-dashed p-3 text-center text-xs outline-none focus-visible:border-[color:var(--ring)] ${
          over
            ? "border-[color:var(--ring)]"
            : "border-[color:var(--border)]"
        }`}
        onDragLeave={() => setOver(false)}
        onDragOver={(event) => {
          // Without this the browser answers a drop by navigating to the file,
          // which loses the page and everything typed into it.
          event.preventDefault();
          setOver(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void take(event.dataTransfer.files[0]);
        }}
        onPaste={(event) => {
          const file = [...event.clipboardData.items]
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            .find((candidate) => candidate !== null);
          if (file) {
            event.preventDefault();
            void take(file);
          }
        }}
        role="group"
        tabIndex={0}
      >
        {dataUrl === "" ? (
          <span className="text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]">
            Drop the logo here, or click this box and press paste.
            <br />
            PNG, JPEG or WebP, under {Math.round(maxImageBytes / 1_024)} KB.
          </span>
        ) : (
          <img
            alt="The logo as it will appear"
            className="h-10 w-auto max-w-full object-contain"
            src={dataUrl}
          />
        )}
      </div>

      {dataUrl === "" ? null : (
        <Button
          onClick={() => {
            onChange("");
            onProblem("");
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          Remove this image
        </Button>
      )}
    </div>
  );
}
