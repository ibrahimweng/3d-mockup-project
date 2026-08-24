/**
 * Getting from a palette row to the thing it names.
 *
 * The controls panel already marks every control group with the target it
 * writes, for the browser tests to find; the palette reads the same attribute.
 * Nothing here is a second source of truth about where a control lives — if the
 * attribute moves, the tests fail first.
 */

const quickActionControlTargetAttribute = "data-toolcraft-control-target";
const quickActionControlTargetsAttribute = "data-toolcraft-control-targets";

/** Long enough to catch the eye after the dialog's own close, short enough not to linger. */
export const quickActionRevealFlashMs = 1200;
export const quickActionRevealAttribute = "data-quick-action-revealed";

function matchesTargetList(value: string | null, target: string): boolean {
  if (value === null) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.includes(target);
  } catch {
    return false;
  }
}

export function findQuickActionControlElement(
  target: string,
  root: ParentNode = document,
): HTMLElement | null {
  const direct = root.querySelector<HTMLElement>(
    `[${quickActionControlTargetAttribute}="${target}"]`,
  );
  if (direct !== null) return direct;

  // Vector and paired controls list several targets on one group.
  for (const node of root.querySelectorAll<HTMLElement>(
    `[${quickActionControlTargetsAttribute}]`,
  )) {
    if (matchesTargetList(node.getAttribute(quickActionControlTargetsAttribute), target)) {
      return node;
    }
  }
  return null;
}

/**
 * Tried in order, not joined into one selector.
 *
 * A comma-joined selector returns whatever comes first in the document, and in
 * this panel that is the keyframe toggle sitting beside the value — so the
 * palette would hand over focus with Enter bound to keying a frame. Preference
 * has to be expressed as order, and the value a person came to adjust is what
 * they should be able to adjust.
 */
/**
 * The flash is drawn by animating the element rather than by a stylesheet.
 *
 * The control belongs to the framework's panel, and a plain CSS file that
 * selects into it is a global rule that can restyle the signed host — the
 * product boundary check rejects exactly that, and it is right to. An element
 * animation touches one node for one second and leaves no rule behind: the Web
 * Animations API does not persist the final frame, so nothing has to be undone.
 */
function flashQuickActionRing(element: HTMLElement): void {
  if (typeof element.animate !== "function") return;

  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() ||
    "#7c9cff";
  const ring = `0 0 0 2px color-mix(in oklab, ${accent} 70%, transparent)`;
  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  element.animate(
    [
      { boxShadow: ring, offset: 0 },
      { boxShadow: ring, offset: 0.55 },
      { boxShadow: "0 0 0 2px transparent", offset: 1 },
    ],
    { duration: prefersReducedMotion ? 1 : quickActionRevealFlashMs, easing: "ease-out" },
  );
}

const quickActionFocusPreference: readonly string[] = [
  "input[type=range]",
  "input:not([type=hidden]):not([disabled])",
  "[role=combobox]",
  "[role=slider]",
  "select:not([disabled])",
  "button:not([disabled])",
];

function findQuickActionFocusTarget(element: HTMLElement): HTMLElement | null {
  for (const selector of quickActionFocusPreference) {
    const match = element.querySelector<HTMLElement>(selector);
    if (match !== null) return match;
  }
  return null;
}

/**
 * Scrolls the control into view and puts the caret on it, so the value the
 * palette just set can be adjusted without reaching for the mouse. Returns
 * whether the control was found — the caller decides what to do if it was not,
 * which for a collapsed section means opening it and asking again.
 */
export function revealQuickActionControl(
  target: string,
  root: ParentNode = document,
): boolean {
  const element = findQuickActionControlElement(target, root);
  if (element === null) return false;

  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.setAttribute(quickActionRevealAttribute, "true");
  window.setTimeout(() => {
    element.removeAttribute(quickActionRevealAttribute);
  }, quickActionRevealFlashMs);
  flashQuickActionRing(element);

  // `preventScroll`, because the smooth scroll above is already underway and
  // focus would otherwise jump the panel to the element instantly.
  findQuickActionFocusTarget(element)?.focus({ preventScroll: true });
  return true;
}

/**
 * Presses a real action button by its label.
 *
 * Exports are owned by the controls panel, which holds the render host and the
 * scene-export visibility they need. Reaching those from product code would
 * mean a second export path beside the Deliver buttons; clicking the button
 * that already exists keeps exactly one, and keeps the palette honest about
 * what it is doing.
 */
export function activateQuickActionPanelButton(
  label: string,
  root: ParentNode = document,
): boolean {
  for (const button of root.querySelectorAll<HTMLButtonElement>("button")) {
    if (button.disabled) continue;
    if ((button.textContent ?? "").trim() === label) {
      button.click();
      return true;
    }
  }
  return false;
}
