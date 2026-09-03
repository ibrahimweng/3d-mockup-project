import type { Page } from "@playwright/test";

import { expect, test } from "./toolcraft-product-test";

import { expectToolcraftAcceptanceOutcome } from "./browser-acceptance-outcome-helpers";
import { appSchema } from "../src/app/app-schema";
import {
  PANEL_TAB_OPTIONS,
  PANEL_TAB_TARGET,
  type PanelTab,
} from "../src/app/panel-tabs";

const SECTIONS = appSchema.panels.controls?.sections ?? [];

// Four tabs, each proved by sampling the panel until it settles, and a first
// paint that loads a model and convolves an environment before any of it. The
// 30s default is a single-assertion budget and this is a walk through the panel.
test.setTimeout(300_000);

/**
 * Sections that can render nothing at all, and so leave the panel entirely.
 *
 * A section whose every control is device-conditional has nothing to show for a
 * product that declares none of them: the colour parts of a phone, the surface
 * under a shirt. Derived from the schema rather than listed, so a section that
 * gains an always-on control stops being allowed to vanish.
 */
const DROPPABLE = new Set(
  SECTIONS.filter((section) =>
    Object.values(section.controls).every(
      (control) => control.applicability?.mode === "conditional",
    ),
  ).map((section) => section.id),
);

/**
 * Which sections a tab should list, read off the schema rather than written out.
 *
 * The claim under test is that the panel shows what the schema says it shows,
 * so listing the answer here by hand would only prove the list agrees with
 * itself. A section with no `visibleWhen` on the tab target belongs to every
 * tab: Setup, the tab bar itself and the export footer.
 */
function expectedSectionIds(tab: PanelTab): string[] {
  return SECTIONS.filter(
    (section) =>
      section.visibleWhen?.target !== PANEL_TAB_TARGET ||
      section.visibleWhen.equals === tab,
  ).map((section) => section.id);
}

async function renderedSectionIds(page: Page): Promise<string[]> {
  return page
    .locator("[data-toolcraft-controls-section-anchor]")
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        (node as HTMLElement).dataset.toolcraftControlsSectionAnchor?.replace(
          "toolcraft-controls-section-",
          "",
        ) ?? "",
      ),
    );
}

function tabTrigger(page: Page, label: string) {
  return page
    .locator(`[data-toolcraft-control-target="${PANEL_TAB_TARGET}"]`)
    .locator('[data-slot="tabs-control"]')
    .first()
    .getByRole("tab", { exact: true, name: label });
}

test("browser: each panel tab replaces the sections shown beneath it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(tabTrigger(page, PANEL_TAB_OPTIONS[0].label)).toBeVisible();

  // Every tab in turn, each proving it changed which sections the panel lists.
  // Asserting only that the set is right would pass on a panel that ignored the
  // tabs and always showed everything, so each step also has to be a change.
  for (const option of PANEL_TAB_OPTIONS.slice(1)) {
    const after = await expectToolcraftAcceptanceOutcome(
      () => renderedSectionIds(page),
      async () => {
        await tabTrigger(page, option.label).click();
        await expect(tabTrigger(page, option.label)).toHaveAttribute(
          "aria-selected",
          "true",
        );
      },
      {
        evidenceType: "command-side-effect",
        requirementId: "view.tab.sections",
      },
    );

    // Every section this tab owns, in order, except that a section whose every
    // control is device-conditional renders nothing for a product that declares
    // none of them and drops out — the templates sheet, for one, which a phone
    // has no zones for. A section from another tab appearing here still fails,
    // and so does one going missing that the device does offer.
    const expected = expectedSectionIds(option.value);
    expect(after, `The ${option.label} tab should list its own sections.`).toEqual(
      expected.filter((id) => !DROPPABLE.has(id) || after.includes(id)),
    );
  }

  // And back to the first, which proves the switch is a switch rather than a
  // one-way narrowing of the panel.
  await tabTrigger(page, PANEL_TAB_OPTIONS[0].label).click();
  await expect(tabTrigger(page, PANEL_TAB_OPTIONS[0].label)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const first = await renderedSectionIds(page);
  expect(first).toEqual(
    expectedSectionIds(PANEL_TAB_OPTIONS[0].value).filter(
      (id) => !DROPPABLE.has(id) || first.includes(id),
    ),
  );

  // The export buttons are the point of the app and belong under every tab.
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeVisible();
});

/**
 * The tab bar's own fallback, which is the component's and not this app's.
 *
 * Tabs render as a select when four cells cannot keep their text and padding on
 * one row. The panel is a fixed column, so the way to reach that state is to
 * take the width away from the control rather than from the window, which is
 * what the component measures either way.
 */
test("browser: a tab bar too narrow for its cells offers the same options as a select", async ({
  page,
}) => {
  await page.goto("/");
  const control = page
    .locator(`[data-toolcraft-control-target="${PANEL_TAB_TARGET}"]`)
    .locator('[data-slot="tabs-control"]')
    .first();
  await expect(control).toHaveAttribute("data-presentation", "tabs");

  await page.addStyleTag({
    content: '[data-slot="tabs-control"] { max-width: 48px; }',
  });
  await expect(control).toHaveAttribute("data-presentation", "select");
  await expect(control.locator("[role=combobox]").first()).toContainText(
    PANEL_TAB_OPTIONS[0].label,
  );

  await page.evaluate(() => {
    document.querySelectorAll("style").forEach((style) => {
      if (style.textContent?.includes("tabs-control")) style.remove();
    });
  });
  await expect(control).toHaveAttribute("data-presentation", "tabs");
  await expect(tabTrigger(page, PANEL_TAB_OPTIONS[0].label)).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
