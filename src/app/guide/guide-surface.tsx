import * as React from "react";

import { FirstRunTour } from "../tour/first-run-tour";
import { GuideDialog } from "./guide-dialog";
import { guideSignal } from "./open-signal";

/**
 * The two things that explain the app: the tour a first-time visitor is walked
 * through, and the help screen anyone can open afterwards from the toolbar.
 *
 * The tour replaced a card in the corner that listed three steps and hoped.
 * Reading three lines and doing three things are not the same, and only one of
 * them leaves someone able to do it again.
 */
export function GuideSurface(): React.JSX.Element {
  const [isGuideOpen, setIsGuideOpen] = React.useState(false);
  const openGuide = React.useCallback(() => setIsGuideOpen(true), []);

  React.useEffect(() => guideSignal.subscribe(openGuide), [openGuide]);

  return (
    <>
      <FirstRunTour />
      <GuideDialog onOpenChange={setIsGuideOpen} open={isGuideOpen} />
    </>
  );
}
