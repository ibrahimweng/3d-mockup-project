import { expect, type Locator, type Page } from "@playwright/test";

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

export async function countToolcraftControlOwnersByTarget(
  page: Page,
  target: string,
): Promise<number> {
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
