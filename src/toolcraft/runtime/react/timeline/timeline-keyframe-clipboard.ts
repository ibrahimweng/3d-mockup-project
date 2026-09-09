import type { ToolcraftTimelineClipboardKeyframe } from '../../state/types';

/**
 * What was last copied, held outside the workspace on purpose.
 *
 * A clipboard is not part of the document. Keeping it in state would put it in
 * the undo history, in a saved file, and in an exported settings blob — three
 * places a copy has no business surviving into, and one of them shared. It
 * lives here for the same reason the system clipboard is not in your document:
 * it belongs to the session, not to the work.
 *
 * Module scope rather than a ref so that it survives the timeline panel
 * unmounting, which is what happens whenever the panel is collapsed. Copying,
 * collapsing the panel and pasting is an ordinary thing to do.
 */
let clipboardKeyframes: readonly ToolcraftTimelineClipboardKeyframe[] = [];

export function setToolcraftTimelineClipboard(
  keyframes: readonly ToolcraftTimelineClipboardKeyframe[],
): void {
  clipboardKeyframes = keyframes;
}

export function getToolcraftTimelineClipboard(): readonly ToolcraftTimelineClipboardKeyframe[] {
  return clipboardKeyframes;
}
