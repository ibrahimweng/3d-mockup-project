import type { ToolcraftControlSchema } from "@/toolcraft/runtime";

import {
  getControlLabelText,
  hasVisibleControlLabel,
} from "./controls";
import {
  getToolcraftLooseTargetPrefix,
  getToolcraftTargetParts,
  getToolcraftTargetProperty,
  humanizeToolcraftLabelPart,
  lowerCaseToolcraftLabelStart,
  normalizeToolcraftSemanticText,
} from "./semantic";
import {
  controlTypeSectionTitlePattern,
  genericControlSectionTitlePattern,
  weakControlLabelContextSectionTitlePattern,
} from "./section-title-rules";

const genericControlLabelPattern =
  /^(angle|amount|blur|brightness|color|contrast|count|density|depth|frequency|height|hue|intensity|offset|opacity|phase|position|quality|radius|rotation|saturation|scale|size|spacing|speed|strength|threshold|tint|width)$/i;

const fontPickerOwnedTypographyPartLabels = new Map<string, string>([
  ["case", "case"],
  ["color", "color"],
  ["colour", "color"],
  ["family", "font family"],
  ["fill", "color"],
  ["fillcolor", "color"],
  ["fillopacity", "opacity"],
  ["font", "font family"],
  ["fontcolor", "color"],
  ["fontfamily", "font family"],
  ["fontid", "font family"],
  ["fontsize", "font size"],
  ["fontweight", "font weight"],
  ["foreground", "color"],
  ["foregroundcolor", "color"],
  ["leading", "line height"],
  ["letterspacing", "letter spacing"],
  ["lineheight", "line height"],
  ["opacity", "opacity"],
  ["size", "font size"],
  ["textcase", "case"],
  ["textcolor", "color"],
  ["textfill", "color"],
  ["textopacity", "opacity"],
  ["tracking", "letter spacing"],
  ["typeface", "font family"],
  ["weight", "font weight"],
]);

const fontPickerDescriptionOwnedPartPatterns: ReadonlyArray<readonly [string, RegExp]> = [
  ["font family", /\b(?:font\s+family|family|typeface)\b/i],
  ["font weight", /\b(?:font\s+weight|weight)\b/i],
  ["font size", /\b(?:font\s+size|size)\b/i],
  ["case", /\b(?:text\s+case|case|uppercase|lowercase|capitalize|title\s+case)\b/i],
  ["color", /\b(?:text\s+color|font\s+color|color|colour|fill)\b/i],
  ["opacity", /\b(?:text\s+opacity|font\s+opacity|opacity|alpha)\b/i],
  ["letter spacing", /\b(?:letter\s+spacing|tracking)\b/i],
  ["line height", /\b(?:line\s+height|leading)\b/i],
];

function isToolcraftWeakSectionContext(sectionTitle: string | undefined): boolean {
  if (!sectionTitle) {
    return true;
  }

  return (
    genericControlSectionTitlePattern.test(sectionTitle) ||
    controlTypeSectionTitlePattern.test(sectionTitle) ||
    weakControlLabelContextSectionTitlePattern.test(sectionTitle)
  );
}

function doesToolcraftSectionMatchTarget(
  sectionTitle: string | undefined,
  target: string,
): boolean {
  const sectionText = normalizeToolcraftSemanticText(sectionTitle);

  if (!sectionText) {
    return false;
  }

  return getToolcraftTargetParts(target).some((part) => {
    const targetText = normalizeToolcraftSemanticText(part);
    return (
      targetText.length > 0 &&
      (targetText === sectionText ||
        targetText.includes(sectionText) ||
        sectionText.includes(targetText))
    );
  });
}

function getToolcraftSuggestedControlLabel(
  control: ToolcraftControlSchema,
  sectionTitle: string | undefined,
): string {
  const label = getControlLabelText(control).trim();
  const targetProperty = humanizeToolcraftLabelPart(control.target.split(".").at(-1) ?? "");
  const normalizedLabel = normalizeToolcraftSemanticText(label);
  const normalizedTargetProperty = normalizeToolcraftSemanticText(targetProperty);

  if (
    label &&
    normalizedTargetProperty &&
    normalizedTargetProperty !== normalizedLabel &&
    normalizedTargetProperty.endsWith(normalizedLabel)
  ) {
    return targetProperty;
  }

  const property = label || targetProperty;
  const loosePrefix = getToolcraftLooseTargetPrefix(control.target);
  const prefixParts = loosePrefix ? getToolcraftTargetParts(loosePrefix) : [];
  const prefixEntity = humanizeToolcraftLabelPart(prefixParts.at(-1) ?? "");
  const sectionEntity =
    sectionTitle && !isToolcraftWeakSectionContext(sectionTitle)
      ? humanizeToolcraftLabelPart(sectionTitle)
      : "";
  const entity = prefixEntity || sectionEntity;

  if (!entity) {
    return property;
  }

  const normalizedEntity = normalizeToolcraftSemanticText(entity);
  const normalizedProperty = normalizeToolcraftSemanticText(property);

  if (normalizedEntity && normalizedProperty.includes(normalizedEntity)) {
    return property;
  }

  return `${entity} ${lowerCaseToolcraftLabelStart(property)}`;
}

export function getToolcraftFontPickerOwnedTypographyPart(
  control: ToolcraftControlSchema,
): string | undefined {
  if (control.type === "fontPicker") {
    return undefined;
  }

  const normalizedCandidates = [
    getToolcraftTargetProperty(control.target),
    getControlLabelText(control),
  ].map(normalizeToolcraftSemanticText);

  for (const candidate of normalizedCandidates) {
    const ownedPart = fontPickerOwnedTypographyPartLabels.get(candidate);

    if (ownedPart) {
      return ownedPart;
    }
  }

  return undefined;
}

export function getToolcraftDuplicateSectionTitleLabelError({
  control,
  controlId,
  sectionLabel,
  sectionTitle,
}: {
  control: ToolcraftControlSchema;
  controlId: string;
  sectionLabel: string;
  sectionTitle: string | undefined;
}): string | undefined {
  if (
    control.type === "tabs" ||
    !sectionTitle ||
    !hasVisibleControlLabel(control) ||
    normalizeToolcraftSemanticText(getControlLabelText(control)) !==
      normalizeToolcraftSemanticText(sectionTitle)
  ) {
    return undefined;
  }

  const label = getControlLabelText(control).trim();

  return `${sectionLabel} / ${controlId} visible label "${label}" duplicates section title "${sectionTitle}". Set label: false when the section supplies the complete visible context, or use a more specific label for a distinct setting.`;
}

/**
 * A pad has no way to be anonymous, so it must be named.
 *
 * Vector draws its name unconditionally — there is no `showLabel` on the way
 * in, and the runtime resolves a missing label to the control's own id rather
 * than to nothing. So `label: false` on a pad does not hide the label, it puts
 * the variable name on the screen: the framing pad read "framing" in lowercase
 * under a FRAMING heading, and the key light's read "keyDirection". The same
 * string is the pad's accessible name, so a screen reader announced it too.
 *
 * The label has to say something the section title does not, which the
 * duplicate-title rule already enforces — name what the pad moves rather than
 * repeating the heading above it.
 */
export function getToolcraftUnlabeledPadError({
  control,
  controlId,
  sectionLabel,
}: {
  control: ToolcraftControlSchema;
  controlId: string;
  sectionLabel: string;
}): string | undefined {
  if (control.type !== "vector" || hasVisibleControlLabel(control)) {
    return undefined;
  }

  return `${sectionLabel} / ${controlId} is a Vector with no label, and a Vector always draws the name it is given. Unlabeled, that name is the control id "${controlId}", which is what reaches the screen and the screen reader. Give it a label naming what it moves.`;
}

export function getToolcraftGenericControlLabelError({
  control,
  controlId,
  sectionLabel,
  sectionLoosePrefixCount,
  sectionTitle,
}: {
  control: ToolcraftControlSchema;
  controlId: string;
  sectionLabel: string;
  sectionLoosePrefixCount: number;
  sectionTitle: string | undefined;
}): string | undefined {
  const label = getControlLabelText(control).trim();

  if (!genericControlLabelPattern.test(label)) {
    return undefined;
  }

  const hasWeakContext =
    isToolcraftWeakSectionContext(sectionTitle) ||
    (sectionLoosePrefixCount > 1 &&
      !doesToolcraftSectionMatchTarget(sectionTitle, control.target));

  if (!hasWeakContext) {
    return undefined;
  }

  const suggestedLabel = getToolcraftSuggestedControlLabel(control, sectionTitle);

  return `${sectionLabel} / ${controlId} label "${label}" is too generic in this context. Short labels are allowed when the nearest visible section or group clearly names the affected product entity. Rename it to "${suggestedLabel}".`;
}

export function getToolcraftControlDescriptionError({
  control,
  controlId,
  sectionLabel,
  sectionTitle,
}: {
  control: ToolcraftControlSchema;
  controlId: string;
  sectionLabel: string;
  sectionTitle: string | undefined;
}): string | undefined {
  const description = control.description?.trim();

  if (!description) {
    return undefined;
  }

  if (control.type !== "fontPicker") {
    return undefined;
  }

  const repeatedParts = fontPickerDescriptionOwnedPartPatterns
    .filter(([, pattern]) => pattern.test(description))
    .map(([part]) => part);

  if (repeatedParts.length < 2) {
    return undefined;
  }

  return `${sectionLabel} / ${controlId} description repeats FontPicker-owned fields (${repeatedParts.join(", ")}). FontPicker help must explain only non-obvious product behavior; use section titles and visible field labels for font family, weight, size, case, color, opacity, letter spacing, and line height, or omit description.`;
}
