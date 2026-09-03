import { expect, type Locator, type Page } from "@playwright/test";

import { appSchema } from "../src/app/app-schema";
import { PANEL_TAB_OPTIONS, PANEL_TAB_TARGET } from "../src/app/panel-tabs";

const TOOLCRAFT_APP_ROOT_SELECTOR = '[data-slot="toolcraft-runtime-app"]';
/** More passes than any panel has sections, so a stuck header cannot spin. */
const TOOLCRAFT_MAX_COLLAPSED_SECTION_EXPANSIONS = 40;
const TOOLCRAFT_CONTROL_TARGET_BOUNDARY_SELECTOR = [
  "[data-toolcraft-control-target]",
  "[data-toolcraft-control-targets]",
].join(", ");

function parseTargetList(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

type ToolcraftControlOwnerMatch = {
  boundaryIndex: number;
  fieldIndex?: number;
};

/**
 * Open every collapsed controls section before looking for a control.
 *
 * A collapsed section unmounts its body outright, so a control inside one is
 * not hidden, it is absent, and a target-scoped lookup reports zero owners
 * rather than an invisible one. Whether a person happened to leave a section
 * open is not what any of these proofs is about — a test drives a control by
 * its schema target, the same way it does not care how far the panel is
 * scrolled — so open them all and let the lookup speak for itself.
 */
export async function expandCollapsedControlSections(page: Page): Promise<void> {
  const collapsedHeaders = page
    .locator(TOOLCRAFT_APP_ROOT_SELECTOR)
    .locator('[data-slot="control-section-header"][data-collapsed="true"]');

  // Recount each pass: expanding one section re-renders the panel around it.
  for (let guard = 0; guard < TOOLCRAFT_MAX_COLLAPSED_SECTION_EXPANSIONS; guard += 1) {
    const remaining = await collapsedHeaders.count();
    if (remaining === 0) return;

    await collapsedHeaders
      .first()
      .locator("[data-control-section-collapse-button]")
      .first()
      .click();
    // Insist on progress rather than clicking the same header forty times: a
    // header that will not open is worth a named failure, not a silent stall.
    await expect(
      collapsedHeaders,
      "Expanding a controls section must leave one fewer collapsed.",
    ).toHaveCount(remaining - 1, { timeout: 5_000 });
  }
}

async function findToolcraftControlOwnerMatches(
  page: Page,
  normalizedTarget: string,
): Promise<{
  boundaries: Locator;
  matches: ToolcraftControlOwnerMatch[];
}> {
  const boundaries = page
    .locator(TOOLCRAFT_APP_ROOT_SELECTOR)
    .locator(TOOLCRAFT_CONTROL_TARGET_BOUNDARY_SELECTOR);
  const matches: ToolcraftControlOwnerMatch[] = [];
  const boundaryCount = await boundaries.count();

  for (let boundaryIndex = 0; boundaryIndex < boundaryCount; boundaryIndex += 1) {
    const boundary = boundaries.nth(boundaryIndex);
    const singleTarget = await boundary.getAttribute("data-toolcraft-control-target");
    if (singleTarget === normalizedTarget) {
      matches.push({ boundaryIndex });
      continue;
    }

    const groupedTargets = parseTargetList(
      await boundary.getAttribute("data-toolcraft-control-targets"),
    );
    const fieldIndex = groupedTargets.indexOf(normalizedTarget);
    if (fieldIndex >= 0) {
      matches.push({ boundaryIndex, fieldIndex });
    }
  }

  return { boundaries, matches };
}

function normalizeTarget(target: string): string {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) {
    throw new Error("A target-scoped browser action requires a non-empty schema target.");
  }
  return normalizedTarget;
}

/**
 * Which panel tab a schema target lives under, or nothing if it is always on.
 *
 * Read off the schema rather than listed here, for the same reason the product
 * proofs read their colour slots off the catalog: a list kept by hand is how a
 * helper ends up opening the wrong tab for a control that moved.
 */
function getPanelTabOwning(target: string): string | undefined {
  const section = appSchema.panels.controls?.sections.find((candidate) =>
    Object.values(candidate.controls).some(
      (control) => control.target === target,
    ),
  );

  return section?.visibleWhen?.target === PANEL_TAB_TARGET
    ? (section.visibleWhen.equals as string)
    : undefined;
}

/**
 * Open the tab that owns a control before looking for it.
 *
 * The same situation as a collapsed section, and the same answer: a section on
 * another tab is not hidden, it is absent, so a target-scoped lookup reports
 * zero owners. A proof drives a control by its schema target and does not care
 * which tab a person left open, so put the panel on the one that owns it.
 *
 * The tab bar renders its options as a select when four cells will not keep
 * their padding on one row, and the tabs it falls back from stay in the DOM
 * invisible, so this drives whichever presentation is live.
 */
export async function openPanelTabOwning(
  page: Page,
  target: string,
): Promise<void> {
  const tab = getPanelTabOwning(target);
  const label = PANEL_TAB_OPTIONS.find(
    (option) => option.value === tab,
  )?.label;

  if (!label) return;

  const control = page
    .locator(TOOLCRAFT_APP_ROOT_SELECTOR)
    .locator(`[data-toolcraft-control-target="${PANEL_TAB_TARGET}"]`)
    .locator('[data-slot="tabs-control"]')
    .first();

  // A fixture app built from another schema has no tab bar, and nothing on its
  // panel is behind one.
  if ((await control.count()) === 0) return;

  if ((await control.getAttribute("data-presentation")) === "select") {
    const combobox = control.locator("[role=combobox]").first();
    if ((await combobox.innerText()).trim() === label) return;
    await combobox.click();
    await page
      .locator("[role=listbox]:visible [role=option]", {
        hasText: new RegExp(`^${label}$`),
      })
      .first()
      .click();
    await expect(combobox).toContainText(label);
    return;
  }

  const trigger = control.getByRole("tab", { exact: true, name: label });
  if ((await trigger.getAttribute("aria-selected")) === "true") return;
  await trigger.click();
  await expect(
    trigger,
    `Choosing the ${label} tab must leave it the selected one.`,
  ).toHaveAttribute("aria-selected", "true", { timeout: 5_000 });
}

export async function countToolcraftControlOwnersByTarget(
  page: Page,
  target: string,
): Promise<number> {
  await openPanelTabOwning(page, target);
  await expandCollapsedControlSections(page);
  const { matches } = await findToolcraftControlOwnerMatches(
    page,
    normalizeTarget(target),
  );
  return matches.length;
}

export async function getToolcraftControlFieldByTarget(
  page: Page,
  target: string,
): Promise<Locator> {
  const normalizedTarget = normalizeTarget(target);
  await openPanelTabOwning(page, normalizedTarget);
  await expandCollapsedControlSections(page);
  const { boundaries, matches } = await findToolcraftControlOwnerMatches(
    page,
    normalizedTarget,
  );

  if (matches.length !== 1) {
    throw new Error(
      `A target-scoped browser action requires exactly one rendered control owner for schema target "${normalizedTarget}"; found ${matches.length}.`,
    );
  }

  const [match] = matches;
  const boundary = boundaries.nth(match.boundaryIndex);
  const fields = boundary.locator('[data-slot="field"]');
  const control =
    match.fieldIndex === undefined
      ? (await fields.count()) > 0
        ? fields.first()
        : boundary
      : fields.nth(match.fieldIndex);
  await expect(
    control,
    `The rendered control for schema target "${normalizedTarget}" must be visible.`,
  ).toBeVisible();
  return control;
}
