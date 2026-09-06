import * as React from "react";

/** How far the dim is held back from the thing it is pointing at. */
const spotlightPadding = 8;

export type SpotlightRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

/**
 * Dim everything except one rectangle, and leave that rectangle alone.
 *
 * Four panels around the hole rather than one overlay with a transparent
 * middle, because the hole has to be a real hole. The step is "use this
 * control", so the control has to be usable: anything covering it, even
 * something fully transparent, is between the pointer and the thing — and
 * `pointer-events: none` on a covering element does not help, since the ring
 * and the dim both need to be drawn and only one of them can opt out.
 *
 * Four rectangles have no middle at all. Nothing is over the control, so a
 * press lands on it exactly as it would have without a tour running.
 */
export function TourSpotlight({
  rect,
}: {
  rect: SpotlightRect | null;
}): React.JSX.Element {
  const dim = "fixed z-40 bg-black/55";

  if (rect === null) {
    return <div aria-hidden="true" className={`${dim} inset-0`} />;
  }

  const top = Math.max(0, rect.top - spotlightPadding);
  const left = Math.max(0, rect.left - spotlightPadding);
  const right = rect.left + rect.width + spotlightPadding;
  const bottom = rect.top + rect.height + spotlightPadding;

  return (
    <div aria-hidden="true" data-slot="mockup-tour-spotlight">
      <div className={dim} style={{ height: top, left: 0, right: 0, top: 0 }} />
      {/*
        * `dvh`, not `vh`.
        *
        * On a phone `100vh` is the window with the browser's own toolbar
        * hidden, which is taller than what is actually on screen. This panel is
        * pinned to the bottom and sized by subtraction, so the extra height
        * pushed its top edge up and over the very control the step was pointing
        * at. That is the fault the four rectangles exist to avoid, arrived at
        * from the other direction. `dvh` is the height that is really there.
        */}
      <div
        className={dim}
        style={{ bottom: 0, height: `calc(100dvh - ${bottom}px)`, left: 0, right: 0 }}
      />
      <div
        className={dim}
        style={{ height: bottom - top, left: 0, top, width: left }}
      />
      <div
        className={dim}
        style={{ height: bottom - top, left: right, right: 0, top }}
      />
      {/*
        * The ring, drawn as a border on a box that sits inside the hole rather
        * than over it: `inset` keeps its own pixels off the control's edge, and
        * it takes no pointer events of its own.
        */}
      <div
        className="pointer-events-none fixed z-40 rounded-lg ring-2 ring-[color:var(--primary)] ring-offset-0"
        style={{ height: bottom - top, left, top, width: right - left }}
      />
    </div>
  );
}

/**
 * The box an element occupies, looking through the ones that occupy none.
 *
 * The panel marks each control with `data-toolcraft-control-target` on a
 * wrapper styled `display: contents` — it exists to carry the attribute and
 * deliberately generates no box of its own, so `getBoundingClientRect` on it is
 * zeros. Measured, not guessed: the model picker's wrapper reported
 * `0 × 0 at (0, 0)` while the picker itself sat at `1203, 226, 274 × 28`.
 *
 * A zero-size box put the hole in the top-left corner of the window, which
 * meant the dim covered the whole panel including the control the step was
 * pointing at. `elementFromPoint` on the picker returned the dim. So the tour
 * silently blocked every step's own control, and there was no way past it but
 * Skip.
 *
 * Hence: when an element has no box, take the union of the boxes of whatever
 * is inside it. That is the box a person sees, which is the one to cut out.
 */
function measureVisibleBox(element: Element): DOMRect | null {
  const own = element.getBoundingClientRect();
  if (own.width > 0 && own.height > 0) return own;

  let union: DOMRect | null = null;
  for (const child of element.children) {
    const box = measureVisibleBox(child);
    if (box === null) continue;
    union =
      union === null
        ? box
        : new DOMRect(
            Math.min(union.left, box.left),
            Math.min(union.top, box.top),
            Math.max(union.right, box.right) - Math.min(union.left, box.left),
            Math.max(union.bottom, box.bottom) - Math.min(union.top, box.top),
          );
  }
  return union;
}

/**
 * Follow a live element's box.
 *
 * Polled rather than observed, because there are four ways this box moves and
 * only some of them are observable: the panel scrolls, a section expands, the
 * window resizes, and the panel re-renders the row entirely when the tab
 * changes. A `ResizeObserver` sees the last two and misses the scroll; a
 * scroll listener needs to know which of several ancestors actually scrolls.
 * Reading the rectangle costs a layout query on an animation frame, which is
 * what a scroll handler would have cost anyway.
 */
export function useSpotlightRect(
  find: () => Element | null,
  active: boolean,
): SpotlightRect | null {
  const [rect, setRect] = React.useState<SpotlightRect | null>(null);

  React.useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }

    let frame = 0;
    const read = (): void => {
      const element = find();
      const box = element === null ? null : measureVisibleBox(element);
      setRect((previous) => {
        if (box === null) return null;
        const next = {
          height: box.height,
          left: box.left,
          top: box.top,
          width: box.width,
        };
        // Same box, same object: this runs every frame and a new object each
        // time would re-render the tour sixty times a second for nothing.
        return previous !== null &&
          previous.top === next.top &&
          previous.left === next.left &&
          previous.width === next.width &&
          previous.height === next.height
          ? previous
          : next;
      });
      frame = window.requestAnimationFrame(read);
    };

    read();
    return () => window.cancelAnimationFrame(frame);
  }, [active, find]);

  return rect;
}
