import { describe, expect, test } from "vitest";

import { cutExport, planExportGrid, type ExportSize } from "./export-grid";

/**
 * What these prove.
 *
 * The bug this exists for is silent by construction: a browser caps a canvas's
 * backing store, allocates a smaller one, and lets `canvas.width` go on
 * reporting the number it was assigned. Nothing throws and nothing warns. The
 * measured cost was 21.4 per cent of an 8K export -- two bands of bare
 * background where the short buffer ran out -- and the only way to have caught
 * it was to compare what was asked for against what the drawing buffer says
 * arrived.
 *
 * So the context here is a fake one that lies the same way a real browser does.
 */

/** A context that allocates what it is asked for until a total-area cap. */
function cappedByArea(limit: number): (size: ExportSize) => ExportSize {
  return (size) => {
    const area = size.width * size.height;
    if (area <= limit) return size;
    const shrink = Math.sqrt(limit / area);
    return {
      height: Math.floor(size.height * shrink),
      width: Math.floor(size.width * shrink),
    };
  };
}

/** A context that caps each edge instead, which some drivers do. */
function cappedByEdge(limit: number): (size: ExportSize) => ExportSize {
  return (size) => ({
    height: Math.min(size.height, limit),
    width: Math.min(size.width, limit),
  });
}

/** Chrome's cap, and the export that went over it. */
const CANVAS_LIMIT = 33_554_432;
const EIGHT_K: ExportSize = { height: 8192, width: 6553 };

describe("cutting an export into pieces a browser will allocate", () => {
  test("asks for the whole frame first, and takes it when it is given", () => {
    const asked: ExportSize[] = [];
    const grid = planExportGrid(EIGHT_K, (size) => {
      asked.push(size);
      return size;
    });
    // One question, one piece: a context that honours the frame is not split,
    // so nothing about the ordinary export path changes.
    expect(asked).toEqual([EIGHT_K]);
    expect(grid).toEqual({ columns: 1, rows: 1 });
  });

  test("splits until a piece fits, and no further", () => {
    const grid = planExportGrid(EIGHT_K, cappedByArea(CANVAS_LIMIT));
    // 53.7 million pixels against a cap of 33.6, so one halving is enough.
    expect(grid.columns * grid.rows).toBe(2);

    const piece = {
      height: Math.ceil(EIGHT_K.height / grid.rows),
      width: Math.ceil(EIGHT_K.width / grid.columns),
    };
    expect(piece.width * piece.height).toBeLessThanOrEqual(CANVAS_LIMIT);
    // And the piece it settled on is genuinely allocatable, which is the whole
    // question: a grid whose pieces are still short is a smaller version of
    // the same bug.
    expect(cappedByArea(CANVAS_LIMIT)(piece)).toEqual(piece);
  });

  test("splits the long edge, because a cap on area does not care which", () => {
    // Halving 6553 by 8192 across leaves 3277 by 8192, which fits. Halving it
    // down leaves 6553 by 4096, which is 26.8 million and also fits -- but the
    // longer edge is the one that runs into a per-edge cap as well, so it is
    // the one that gives way.
    const wide = planExportGrid({ height: 2000, width: 9000 }, cappedByArea(CANVAS_LIMIT / 4));
    expect(wide.columns).toBeGreaterThan(wide.rows);
    const tall = planExportGrid({ height: 9000, width: 2000 }, cappedByArea(CANVAS_LIMIT / 4));
    expect(tall.rows).toBeGreaterThan(tall.columns);
  });

  test("serves a context capped on an edge rather than on area", () => {
    const grid = planExportGrid(EIGHT_K, cappedByEdge(4096));
    const piece = {
      height: Math.ceil(EIGHT_K.height / grid.rows),
      width: Math.ceil(EIGHT_K.width / grid.columns),
    };
    expect(piece.width).toBeLessThanOrEqual(4096);
    expect(piece.height).toBeLessThanOrEqual(4096);
  });

  test("gives up rather than spinning, on a context that answers nonsense", () => {
    let asked = 0;
    const grid = planExportGrid(EIGHT_K, (size) => {
      asked += 1;
      // Never enough, whatever it is handed.
      return { height: size.height - 1, width: size.width - 1 };
    });
    expect(asked).toBeLessThanOrEqual(9);
    expect(Number.isFinite(grid.columns * grid.rows)).toBe(true);
  });

  test("cuts pieces that butt exactly, covering every pixel once", () => {
    // A frame whose edges divide into nothing: 6553 over three leaves a
    // remainder, which is where a seam would come from.
    const picture: ExportSize = { height: 8192, width: 6553 };
    const seen = new Map<string, number>();
    let area = 0;
    for (const tile of cutExport(picture, { columns: 3, rows: 2 })) {
      area += tile.width * tile.height;
      for (const x of [tile.x, tile.x + tile.width]) {
        seen.set(`x${x}`, (seen.get(`x${x}`) ?? 0) + 1);
      }
      // Every piece knows the whole it belongs to, which is what keeps a tile
      // composed for the picture rather than for itself.
      expect(tile.picture).toBe(picture);
      expect(tile.width).toBeGreaterThan(0);
      expect(tile.height).toBeGreaterThan(0);
    }
    // No pixel left out and none drawn twice.
    expect(area).toBe(picture.width * picture.height);
    // The boundaries are shared rather than each rounded on its own: four
    // distinct column edges for three columns, not six near-misses.
    expect([...seen.keys()].sort()).toEqual(["x0", "x2184", "x4369", "x6553"]);
  });

  test("declines to divide by a frame with no area", () => {
    expect(planExportGrid({ height: 0, width: 0 }, cappedByArea(1))).toEqual({
      columns: 1,
      rows: 1,
    });
  });
});
