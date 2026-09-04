import type { ResolvedToolcraftControlSchema } from "@/toolcraft/runtime";

import { hasVisibleControlLabel } from "./controls";

export function getToolcraftColorRowGroupingErrors({
  controls,
  sectionLabel,
}: {
  controls: readonly [string, ResolvedToolcraftControlSchema][];
  sectionLabel: string;
}): string[] {
  const plainColors = controls.filter(
    ([, control]) => control.type === "color",
  );
  const isColorOnlySection =
    controls.length > 0 &&
    controls.every(
      ([, control]) =>
        control.type === "color" || control.type === "colorOpacity",
    );

  if (isColorOnlySection || plainColors.length < 2) {
    return [];
  }

  const missingSemanticGroups = plainColors
    .filter(([, control]) => !control.semanticGroup?.trim())
    .map(([controlId]) => controlId);

  return missingSemanticGroups.length === 0
    ? []
    : [
        `${sectionLabel} has multiple plain Color controls in a mixed section and must declare semanticGroup for every plain Color so runtime rows follow product meaning instead of schema adjacency. Missing: ${missingSemanticGroups.join(", ")}.`,
      ];
}

/**
 * A colour bank draws no labels, so a colour in one must not declare a role.
 *
 * The runtime treats a section whose every rendered control is a colour as a
 * bank of swatches and suppresses each swatch's own label. That is right for a
 * palette, where the colours only add variety and the section title is the
 * whole story, and it is how `Parts` came to show a shirt three anonymous
 * squares: the schema declared Product, Trim and Accent, and every one of
 * those names was dropped on the way to the screen. The rule above cannot see
 * it — it exempts colour-only sections outright, because it is asking how a
 * mixed section orders its rows, which is not a question a bank has.
 *
 * So a colour-only section may hold as many colours as it likes, as long as
 * none of them claims a name it will not be given. Two ways out, and the right
 * one depends on which the colours are: drop the labels if they really are
 * interchangeable, or put a control in the section that is not a colour, which
 * takes it out of bank layout and hands every label back.
 *
 * A conditional companion does not count. It leaves for whichever products do
 * not declare it, and a section that is a bank for some of the catalog and not
 * for the rest is worse than one that is always a bank: the labels come and go
 * and nobody watching one product sees it happen.
 */
export function getToolcraftAnonymousColorBankErrors({
  controls,
  sectionLabel,
}: {
  controls: readonly [string, ResolvedToolcraftControlSchema][];
  sectionLabel: string;
}): string[] {
  const colors = controls.filter(
    ([, control]) =>
      control.type === "color" || control.type === "colorOpacity",
  );

  if (colors.length < 2) {
    return [];
  }

  const hasAlwaysOnCompanion = controls.some(
    ([, control]) =>
      control.type !== "color" &&
      control.type !== "colorOpacity" &&
      (control.applicability?.mode ?? "always") === "always",
  );

  if (hasAlwaysOnCompanion) {
    return [];
  }

  const named = colors
    .filter(([, control]) => hasVisibleControlLabel(control))
    .map(([controlId, control]) => `${controlId} ("${control.label as string}")`);

  return named.length === 0
    ? []
    : [
        `${sectionLabel} renders as a color bank, which draws no per-swatch labels, so these colors reach the screen unnamed: ${named.join(", ")}. Set label: false if the colors are interchangeable, or give the section an always-applicable control that is not a color so every label is drawn.`,
      ];
}
