import * as THREE from "three";

import type { LightPatternId } from "../product-domain";

/**
 * The set itself: the cove behind the device, the cut-outs put in front of the
 * key, and the gradients that decide where each of them stops being there.
 *
 * All of it is built to size rather than scaled, because a paper sweep that is
 * scaled is a sweep whose curve changes with the room, and the curve is the
 * only part of it anybody sees.
 */

/**
 * The backdrop a studio actually has: floor, cove, wall, in one surface.
 *
 * Seamless paper rolls down a wall, bends, and runs out along the floor. There
 * is no corner in it anywhere, which is the whole point — a corner would draw
 * a line across the frame and the eye would read a room instead of a nowhere.
 *
 * The profile is swept all the way around rather than dragged sideways, so the
 * paper closes on itself and the set has no ends. A strip has two, and they
 * are found the moment anyone orbits: the wall runs out, and past it is
 * whatever the canvas clears to. Revolving costs a few hundred vertices and
 * removes the entire class of problem — there is no direction to look in that
 * finds an edge, because there is no edge.
 */
export function createSweepGeometry(
  radius: number,
  curve: number,
  height: number,
): THREE.BufferGeometry {
  // Height above the floor and distance out from the middle of the set, walked
  // from the point where the paper leaves the floor to the top of the wall.
  const profile: [number, number][] = [];
  const SEGMENTS = 20;
  for (let index = 0; index <= SEGMENTS; index += 1) {
    const angle = (Math.PI / 2) * (index / SEGMENTS);
    profile.push([
      curve * (1 - Math.cos(angle)),
      radius + curve * Math.sin(angle),
    ]);
  }
  // Above the cove the paper is vertical, and there is only something to add
  // if it was asked to rise further than the bend already takes it.
  if (height > curve) profile.push([height, radius + curve]);

  // Texture coordinates run with distance along the profile rather than with
  // the index, so the fade at the top is the same width of paper however many
  // segments the curve happens to use.
  let travelled = 0;
  const travel = profile.map((point, index) => {
    if (index > 0) {
      const previous = profile[index - 1];
      travelled += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    }
    return travelled;
  });
  const total = travel[travel.length - 1] || 1;

  // Enough segments around that the wall reads as curved rather than faceted
  // at the distances a long lens puts it. The seam is a duplicated column of
  // vertices rather than a shared one, so U can run 0 to 1 without the last
  // quad having to wrap backwards through the whole map.
  const AROUND = 72;
  const columns = AROUND + 1;
  const positions = new Float32Array(profile.length * columns * 3);
  const uvs = new Float32Array(profile.length * columns * 2);
  for (let index = 0; index < profile.length; index += 1) {
    const [up, out] = profile[index];
    for (let column = 0; column < columns; column += 1) {
      const turn = (column / AROUND) * Math.PI * 2;
      const vertex = index * columns + column;
      positions[vertex * 3] = Math.sin(turn) * out;
      positions[vertex * 3 + 1] = up;
      positions[vertex * 3 + 2] = -Math.cos(turn) * out;
      uvs[vertex * 2] = column / AROUND;
      uvs[vertex * 2 + 1] = travel[index] / total;
    }
  }

  const indices: number[] = [];
  for (let index = 0; index < profile.length - 1; index += 1) {
    for (let column = 0; column < AROUND; column += 1) {
      const a = index * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      // Wound so the faces point inwards, at the camera standing in the set.
      indices.push(a, c, d, a, d, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The cut-out the key shines through.
 *
 * Everything in the rig until now is a light with a number on it, and no
 * number makes a room. A gobo does: a shape held in front of the light so that
 * what lands is the shape rather than the light. Bars across a floor read as a
 * window with no window anywhere in the frame, which is the whole trick.
 *
 * Bars only, never a surround blocking the light around them. A real window is
 * a hole in an opaque wall, but the depth map covering this scene is finite,
 * and beyond its edge nothing is shadowed at all — so a surround would draw a
 * hard line across the floor where the map ran out and the light started
 * arriving again. Bars have no such edge: both sides of that boundary are lit,
 * and only the bars are not.
 *
 * The pattern is laid out around the middle rather than through it, so the
 * device stands in a pane and the shadows fall beside it. A bar across the
 * product is a defect however well it reads on the floor.
 *
 * It is also cut to suit the angle it is shining at.
 *
 * A gobo is drawn in the plane facing the light and its shadow lands on a
 * floor, so the two are not the same shape: the flatter the light, the more
 * the floor stretches everything along the direction it is travelling. At the
 * angle sun comes through a window that factor is four or five, which is why a
 * set of slats cut to look right on paper arrives as two enormous stripes. So
 * the sizes here are stated as what they should measure *on the floor*, and
 * squashed by the sine of the light's elevation on the way in.
 *
 * The other half of it is that a gobo has to be bigger than the shadow map, not
 * smaller. Light simply passes either side of a cut-out that runs out, so the
 * pattern does not fade at its edge — it stops, mid-frame, on a hard line. What
 * a window actually is, and what this now builds, is an opaque wall with a hole
 * in it: dark outside, bright in the opening, bars across the opening.
 */
export function createPatternGeometry(
  pattern: LightPatternId,
  radius: number,
  squash: number,
  extent: number,
): THREE.BufferGeometry | null {
  if (pattern === "none") return null;

  // Each piece is a flat quad: centre, half width, half height.
  const bars: [number, number, number, number][] = [];
  /** A floor measurement, in the gobo's own squashed vertical units. */
  const up = (floor: number): number => floor * squash;
  // Generously past the depth map, so no edge of the wall is ever the edge of
  // the pattern. Anything outside the map costs nothing: it is clipped.
  const edge = extent * 1.6;

  /** The wall around an opening, as four rectangles. */
  const wall = (halfWide: number, halfHigh: number): void => {
    bars.push([0, (edge + halfHigh) / 2, edge, (edge - halfHigh) / 2]);
    bars.push([0, -(edge + halfHigh) / 2, edge, (edge - halfHigh) / 2]);
    bars.push([(edge + halfWide) / 2, 0, (edge - halfWide) / 2, halfHigh]);
    bars.push([-(edge + halfWide) / 2, 0, (edge - halfWide) / 2, halfHigh]);
  };

  if (pattern === "window") {
    const halfWide = 3.6 * radius;
    const halfHigh = up(2.6 * radius);
    // Thick enough to survive the projection. A bar is seen from the side the
    // light is going, so a raking key squeezes it across — one cut thin enough
    // to look right on paper arrives as a scratch.
    const bar = 0.13 * radius;
    wall(halfWide, halfHigh);
    // A three-by-three sash, so the device stands in the middle pane.
    for (const sign of [-1, 1]) {
      bars.push([(sign * halfWide) / 3, 0, bar, halfHigh]);
      bars.push([0, (sign * halfHigh) / 3, halfWide, up(bar)]);
    }
  } else {
    // No opening, and no wall around one. A window is a hole in a wall and has
    // to be built as one; a blind is not — it is a stack of slats, and the
    // thing it does to a room is band the whole of it, floor and far wall
    // alike. Giving it a frame put the wall of the gobo across most of the
    // backdrop, which shadowed the backdrop rather than striping it: a room
    // with the blind pulled down and no window behind it.
    //
    // The slats run to the edge of the depth map instead, which is what stops
    // the pattern ending on a line partway across the frame — the fault the
    // frame was doing double duty to prevent.
    //
    // A venetian blind is mostly slat, too. Bands of light with hairlines
    // between them read as a scratched negative; bands of shade with light
    // between them read as a blind, and the ratio is most of what says which.
    const pitch = up(0.62 * radius);
    const slat = pitch * 0.56;
    const count = Math.ceil(edge / pitch);
    // Offset by half a pitch, so the middle of the frame falls in the daylight
    // between two slats rather than under one of them.
    for (let index = -count; index <= count; index += 1) {
      bars.push([0, (index + 0.5) * pitch, edge, slat / 2]);
    }
  }

  const positions = new Float32Array(bars.length * 4 * 3);
  const indices: number[] = [];
  bars.forEach(([x, y, halfWidth, halfHeight], bar) => {
    const corners = [
      [x - halfWidth, y - halfHeight],
      [x + halfWidth, y - halfHeight],
      [x + halfWidth, y + halfHeight],
      [x - halfWidth, y + halfHeight],
    ];
    corners.forEach(([cornerX, cornerY], corner) => {
      const vertex = bar * 4 + corner;
      positions[vertex * 3] = cornerX;
      positions[vertex * 3 + 1] = cornerY;
      positions[vertex * 3 + 2] = 0;
    });
    const base = bar * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}
/**
 * Let the paper run out rather than stop.
 *
 * The sweep is built large enough to fill any sensible framing, but "any" is
 * not "every" — someone will zoom out — and a backdrop that ends shows a lit
 * edge against the void, which is the same tell the floor had. Softening the
 * top and the two sides costs one small texture and means there is no framing
 * that catches it.
 */
export function createSweepFade(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    // Read unflipped, the texture climbs the paper: the foot of the wall is at
    // the top of the canvas and the top of the wall at the bottom of it.
    const up = context.createLinearGradient(0, 0, 0, size);
    // A long dissolve rather than a short one. The paper has a top, and at
    // the heights a studio preset actually runs it to, that top is in frame —
    // where a short fade shows as a horizontal edge across the picture with
    // flat colour above it, which is the backdrop visibly stopping. Taken
    // across half the height it arrives at the scene's own background without
    // ever drawing a line.
    up.addColorStop(0, "#ffffff");
    up.addColorStop(0.45, "#ffffff");
    up.addColorStop(1, "#000000");
    context.fillStyle = up;
    context.fillRect(0, 0, size, size);
    // Nothing across. There used to be a fade at each side, from when the
    // paper was a strip that had to stop somewhere without showing an edge.
    // The paper is swept through a full turn now and closes on itself, so U
    // is an angle rather than a position — and fading its ends took a wedge
    // of a quarter of the circumference clean out of the wall, centred at U
    // nought, which is exactly the piece directly behind the device. The
    // whole back wall has been a hole with the scene's background showing
    // through it: no paper in frame, nothing for a pattern to land on, and a
    // flat field of colour where the backdrop should be.
  }
  const texture = new THREE.CanvasTexture(canvas);
  // Textures are flipped on upload by default, which would put the fade at the
  // foot of the paper rather than the top of it — the backdrop dissolving
  // exactly where it has to be solid.
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}
/**
 * How far the floor plane runs out, in subject radii from the middle.
 *
 * Larger than the furthest the cove is allowed to stand, so the two always
 * meet. Everything past the cove is behind an opaque wall and costs nothing.
 */
export const FLOOR_HALF_EXTENT = 34;
/** The furthest out the paper may stand, in subject radii. */
export const COVE_MAX = 28;
/**
 * How far the table is turned away from square.
 *
 * Enough that the near corner leads and both edges are legibly receding,
 * little enough that the top still reads as a flat plane the device is
 * standing squarely on rather than as a ramp. Measured against the render at
 * the default framing: at eight degrees it looks like a mistake, and past
 * twenty-five the device starts to look dropped onto a moving surface.
 */
export const TABLE_YAW = (16 * Math.PI) / 180;
/**
 * Where the floor gives way to the reflection under it, and where it ends.
 *
 * One gradient does two jobs, because both are the floor's own opacity at a
 * distance from the device.
 *
 * Near the centre it is the reflection: a real polished floor loses the
 * mirrored device with distance, because the surface is never perfectly flat
 * and a grazing angle carries less of it. Without that falloff the reflection
 * sits as hard as the device and reads as a second object standing upside
 * down. The stops are tight because the plane is forty subject radii across,
 * so the pool has to be a small fraction of it to stay under the device.
 *
 * At the rim it is the horizon. The plane is finite, and a finite plane has an
 * edge — a hard line across the frame where the floor stops and the backdrop
 * begins, which is exactly the tell that gives a rendered scene away. A real
 * sweep has no edge because it curves out of sight, so this one dissolves
 * instead: opaque where the device stands, gone by the time it would end.
 *
 * The strength is baked into the gradient rather than set as the material's
 * opacity, because three multiplies the two: an opacity of 0.3 would take the
 * whole floor to thirty percent, edges included, and the sweep would vanish.
 */
export function createFloorFade(reflection: number, dissolve: boolean): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    // Through an alpha map black is fully transparent and white fully opaque,
    // so the centre carries what is left of the floor once the reflection has
    // taken its share.
    const centre = Math.round(255 * (1 - Math.max(0, Math.min(1, reflection))));
    const hex = centre.toString(16).padStart(2, "0");
    // A tall device reflects further from its contact point than a small one,
    // and a fade that reaches three radii leaves a monitor's reflection nearly
    // untouched, so the pool closes within a few percent of the plane.
    // The stops are written in subject radii and converted, so the reflection
    // pool stays the size it was when the plane under it grew to reach the
    // cove. A gradient defined in the plane's own coordinates would have
    // scaled the pool with the floor and made the reflection change size with
    // the focal length.
    const at = (radii: number): number => (radii / FLOOR_HALF_EXTENT) * 0.5;
    gradient.addColorStop(0, `#${hex}${hex}${hex}`);
    gradient.addColorStop(at(0.3), `#${hex}${hex}${hex}`);
    gradient.addColorStop(at(1.4), "#ffffff");
    // Past the reflection the floor is simply floor, and what happens at its
    // rim depends on whether anything is standing there.
    //
    // With a backdrop up, nothing: the cove rises out of the floor and takes
    // over, so the floor has to arrive at full strength or there is a ring of
    // half-floor where the two meet. With no backdrop, the rim is the edge of
    // the world and has to be got rid of, so it dissolves — into the scene
    // background, which is now a real colour rather than a hole in the canvas.
    gradient.addColorStop(dissolve ? at(10) : 1, "#ffffff");
    gradient.addColorStop(1, dissolve ? "#000000" : "#ffffff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
