/**
 * How many pieces an export has to be drawn in.
 *
 * A canvas is not as big as you ask for. Every browser caps the backing store
 * behind one -- Chrome at 33.6 million pixels, Safari lower again -- and the
 * cap is applied without a word: assigning `canvas.width` never throws, and
 * the attribute reads back whatever it was assigned however little was really
 * allocated. The one place the truth shows is the drawing buffer.
 *
 * Nothing in the export path was looking. An 8K portrait frame is 6553 by 8192,
 * which is 53.7 million pixels, so Chrome allocated 5151 by 6440 instead -- the
 * same shape, 78.6 per cent of the size -- and `drawImage` was told the canvas
 * was the full 6553 by 8192. It laid the short buffer into the top left corner
 * and left the rest of the file untouched: two bands of bare export background
 * down the right hand side and along the bottom, and inside them a picture with
 * 6.4K of detail under an 8K name.
 *
 * The answer is not to ask for less. It is to ask several times: cut the frame
 * into pieces the context will really allocate, draw each at its own full
 * resolution, and butt them together. The export is then exactly the size of
 * the canvas it was asked for and carries every pixel of the detail it claims,
 * on a machine that cannot hold the whole frame at once.
 *
 * This module is only the arithmetic -- how many pieces, given what the context
 * turns out to honour -- so it can be checked without a GPU.
 */

export type ExportGrid = Readonly<{ columns: number; rows: number }>;

export type ExportSize = Readonly<{ height: number; width: number }>;

/** One piece of a picture too big to draw at once, all in device pixels. */
export type ExportTile = Readonly<{
  height: number;
  /** The whole picture the piece is cut from. */
  picture: ExportSize;
  width: number;
  x: number;
  y: number;
}>;

/**
 * As many splits as it is ever worth trying.
 *
 * Each round doubles the number of pieces, so eight rounds is a frame cut into
 * 256, by which point either the context is honouring the size or something is
 * wrong that a smaller request will not fix. A ceiling rather than a limit: it
 * exists so a context that reports nonsense cannot spin here.
 */
const MOST_ROUNDS = 8;

/** Every piece the same size, so no tile of the grid is bigger than any other. */
function pieceOf(picture: ExportSize, grid: ExportGrid): ExportSize {
  return {
    height: Math.ceil(picture.height / grid.rows),
    width: Math.ceil(picture.width / grid.columns),
  };
}

/**
 * Split the frame until the context honours a piece of it.
 *
 * `offer` is asked for a size and answers with what it actually got, which is
 * the only honest source for this: the cap is not a number a browser exposes,
 * it varies with the platform and with how much memory is already spoken for,
 * and a figure hard-coded here would be wrong on the first machine that
 * disagreed. So the question is asked of the context that is going to draw.
 *
 * Splitting the longer edge first, because that is what a cap on total area
 * asks for: halving a 6553 by 8192 frame the short way leaves two 6553 by 4096
 * pieces, each still 26.8 million pixels, where halving it the long way is the
 * same count and the same relief. Both are tried in turn, so a context capped
 * on one edge rather than on area is also served.
 */
export function planExportGrid(
  picture: ExportSize,
  offer: (size: ExportSize) => ExportSize,
): ExportGrid {
  if (picture.width <= 0 || picture.height <= 0) return { columns: 1, rows: 1 };

  let grid: ExportGrid = { columns: 1, rows: 1 };
  for (let round = 0; round <= MOST_ROUNDS; round += 1) {
    const piece = pieceOf(picture, grid);
    const got = offer(piece);
    if (got.width >= piece.width && got.height >= piece.height) return grid;
    // Split whichever edge is longer, which on a square frame is the width.
    grid =
      piece.width >= piece.height
        ? { columns: grid.columns * 2, rows: grid.rows }
        : { columns: grid.columns, rows: grid.rows * 2 };
  }
  return grid;
}

/**
 * The pieces themselves, left to right and top to bottom.
 *
 * Every boundary is rounded once and shared, so a tile starts on the pixel the
 * one before it ended on. Rounding each tile's size independently instead
 * leaves a row of pixels belonging to nobody or to two tiles at once, and
 * either is a seam down the middle of the export.
 */
export function* cutExport(
  picture: ExportSize,
  grid: ExportGrid,
): Generator<ExportTile> {
  const edge = (span: number, count: number, at: number): number =>
    Math.round((span * at) / count);
  for (let row = 0; row < grid.rows; row += 1) {
    const y = edge(picture.height, grid.rows, row);
    const height = edge(picture.height, grid.rows, row + 1) - y;
    for (let column = 0; column < grid.columns; column += 1) {
      const x = edge(picture.width, grid.columns, column);
      yield {
        height,
        picture,
        width: edge(picture.width, grid.columns, column + 1) - x,
        x,
        y,
      };
    }
  }
}
