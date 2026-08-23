import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import { getToolcraftSectionLabel } from "./sections";

const runtimeSetupControlTargets = new Set([
  "runtime.settingsTransfer",
  "canvas.infinity",
  "canvas.aspectRatio",
  "canvas.renderScale",
  "canvas.size.width",
  "canvas.size.height",
  "panels.timeline.extended",
]);

export function isRuntimeSetupControlTarget(target: string): boolean {
  return runtimeSetupControlTargets.has(target);
}

export function getToolcraftRuntimeSetupSectionErrors(
  schema: ResolvedToolcraftAppSchema,
): string[] {
  const errors: string[] = [];
  const controlsPanel = schema.panels.controls;

  if (!controlsPanel) {
    return [
      "Generated Toolcraft apps must define a controls panel so the mandatory runtime Setup section is visible.",
    ];
  }

  const sections = schema.panels.controls?.sections ?? [];

  if (sections.length === 0) {
    return [
      'Runtime Setup must be the first visible controls-panel section titled "Setup". Do not ship an empty controls panel.',
    ];
  }

  const setupSection = sections[0];
  const setupTitle = setupSection?.title?.trim();
  const setupControls = Object.values(setupSection?.controls ?? {});
  const setupTargets = new Set(setupControls.map((control) => control.target));
  const hasSetupTarget = (target: string) => setupTargets.has(target);

  if (setupTitle !== "Setup") {
    errors.push(
      'Runtime Setup must be the first visible controls-panel section titled "Setup". Do not move Export Settings, Import Settings, canvas sizing, Resolution scale, or Timeline into app-authored sections.',
    );
  }

  if (
    !setupControls.some(
      (control) =>
        control.type === "settingsTransfer" &&
        control.target === "runtime.settingsTransfer",
    )
  ) {
    errors.push(
      'Runtime Setup must include settingsTransfer at target "runtime.settingsTransfer" so Export Settings and Import Settings are always visible.',
    );
  }

  if (schema.canvas.enabled && schema.canvas.sizing.mode === "editable-output") {
    const missingCanvasTargets = [
      "canvas.infinity",
      "canvas.aspectRatio",
      "canvas.size.width",
      "canvas.size.height",
    ].filter((target) => !hasSetupTarget(target));

    if (missingCanvasTargets.length > 0) {
      errors.push(
        `Runtime Setup for editable-output canvas must include Infinity canvas, Aspect ratio, Canvas width, and Canvas height. Missing targets: ${missingCanvasTargets.join(", ")}.`,
      );
    }
  }

  if (schema.canvas.renderScale.enabled && !hasSetupTarget("canvas.renderScale")) {
    errors.push(
      'Runtime Setup must include Resolution scale at target "canvas.renderScale" whenever canvas.renderScale is enabled.',
    );
  }

  /**
   * A timeline is opened from the timeline, not from the canvas settings.
   *
   * This used to require a "Timeline" switch in Runtime Setup, which had to be
   * found and turned on before the panel along the bottom became a real
   * timeline — and a second control inside it then revealed the tracks. The
   * panel is now always the full thing and its own chevron opens and closes
   * it, so Setup must not carry a switch for it at all.
   */
  if (
    sections.some((section) =>
      Object.values(section.controls).some(
        (control) => control.target === "panels.timeline.extended",
      ),
    )
  ) {
    errors.push(
      'Runtime Setup must not include a Timeline switch; the timeline panel opens and closes from its own header.',
    );
  }

  for (const [sectionIndex, section] of sections.entries()) {
    const isRuntimeSetupSection = sectionIndex === 0 && section.title?.trim() === "Setup";

    for (const [controlId, control] of Object.entries(section.controls)) {
      if (!isRuntimeSetupControlTarget(control.target) || isRuntimeSetupSection) {
        continue;
      }

      const sectionLabel = getToolcraftSectionLabel(section.title, sectionIndex);

      errors.push(
        `${sectionLabel} / ${controlId} uses runtime Setup target "${control.target}". Runtime Setup owns Export Settings, Import Settings, Infinity canvas, Aspect ratio, Canvas width, Canvas height, Resolution scale, and Timeline; do not declare these controls in app-authored sections.`,
      );
    }
  }

  return errors;
}
