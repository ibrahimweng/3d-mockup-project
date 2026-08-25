import * as React from "react";

import { FirstRunWelcome } from "./first-run";
import { GuideDialog } from "./guide-dialog";
import { guideSignal } from "./open-signal";

/**
 * The two things that explain the app: the welcome a first-time visitor sees,
 * and the help screen anyone can open afterwards. They share one piece of
 * state, because the welcome's second button opens the help.
 */
export function GuideSurface(): React.JSX.Element {
  const [isGuideOpen, setIsGuideOpen] = React.useState(false);
  const openGuide = React.useCallback(() => setIsGuideOpen(true), []);

  React.useEffect(() => guideSignal.subscribe(openGuide), [openGuide]);

  return (
    <>
      <FirstRunWelcome onOpenGuide={openGuide} />
      <GuideDialog onOpenChange={setIsGuideOpen} open={isGuideOpen} />
    </>
  );
}
