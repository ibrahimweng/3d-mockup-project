/**
 * Interpolating a camera pose, which is not the same as interpolating its numbers.
 *
 * An orientation is `{ position, up }`, and both are directions. Interpolating
 * them the way every other keyframed value is interpolated — component by
 * component, in a straight line — moves the camera through the inside of the
 * sphere it is supposed to be travelling around. A quarter turn done that way
 * shrinks the camera's distance to 0.707 of what it started at and speeds up
 * through the middle; a half turn passes through the product itself, and at the
 * midpoint the direction is the zero vector, which has no direction to point a
 * camera along at all.
 *
 * So the direction is carried around the sphere instead, at constant angular
 * speed, and how far away the camera is travels separately and linearly. A
 * keyed orbit then does what somebody dragging the gizmo slowly would do.
 */

const nearlyParallel = 0.9995;

function dot(first: readonly number[], second: readonly number[]): number {
  return (first[0] ?? 0) * (second[0] ?? 0) +
    (first[1] ?? 0) * (second[1] ?? 0) +
    (first[2] ?? 0) * (second[2] ?? 0);
}

function magnitude(vector: readonly number[]): number {
  return Math.hypot(vector[0] ?? 0, vector[1] ?? 0, vector[2] ?? 0);
}

function normalize(vector: readonly number[]): number[] | null {
  const length = magnitude(vector);

  return length > 1e-9 ? [(vector[0] ?? 0) / length, (vector[1] ?? 0) / length, (vector[2] ?? 0) / length] : null;
}

/**
 * Some unit vector at right angles to this one.
 *
 * Only needed for the half-turn case, where the two ends point exactly opposite
 * ways and every plane through them is equally valid — there is no shortest arc
 * to prefer. Picking the axis this vector leans on least keeps the cross
 * product well away from zero, so the answer is stable rather than arbitrary
 * to the point of being noisy.
 */
function orthogonal(vector: readonly number[]): number[] {
  const [x = 0, y = 0, z = 0] = vector;
  const axis =
    Math.abs(x) <= Math.abs(y) && Math.abs(x) <= Math.abs(z)
      ? [1, 0, 0]
      : Math.abs(y) <= Math.abs(z)
        ? [0, 1, 0]
        : [0, 0, 1];
  const cross = [
    y * (axis[2] ?? 0) - z * (axis[1] ?? 0),
    z * (axis[0] ?? 0) - x * (axis[2] ?? 0),
    x * (axis[1] ?? 0) - y * (axis[0] ?? 0),
  ];

  return normalize(cross) ?? [0, 1, 0];
}

/** The arc between two unit vectors, walked at constant angular speed. */
export function slerpToolcraftUnitVectors(
  from: readonly number[],
  to: readonly number[],
  progress: number,
): number[] {
  const cosine = Math.max(-1, Math.min(1, dot(from, to)));

  // Close enough to the same direction that the arc and the chord agree, and
  // close enough that dividing by the sine of the angle between them would not.
  if (cosine > nearlyParallel) {
    return (
      normalize([0, 1, 2].map((index) => {
        const start = from[index] ?? 0;
        return start + ((to[index] ?? 0) - start) * progress;
      })) ?? [...from]
    );
  }

  // Exactly opposite: every plane through the two is equally short, so one is
  // chosen and the turn is done in two quarters through it. Without this the
  // sine below is zero and the camera would vanish into the product.
  if (cosine < -nearlyParallel) {
    const midpoint = orthogonal(from);

    return progress < 0.5
      ? slerpToolcraftUnitVectors(from, midpoint, progress * 2)
      : slerpToolcraftUnitVectors(midpoint, to, (progress - 0.5) * 2);
  }

  const angle = Math.acos(cosine);
  const sine = Math.sin(angle);
  const fromWeight = Math.sin((1 - progress) * angle) / sine;
  const toWeight = Math.sin(progress * angle) / sine;

  return [0, 1, 2].map(
    (index) => fromWeight * (from[index] ?? 0) + toWeight * (to[index] ?? 0),
  );
}

export type ToolcraftOrientationValue = {
  readonly position: readonly number[];
  readonly up: readonly number[];
};

function isVector3(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

/**
 * Whether this is a camera pose rather than some other record of numbers.
 *
 * Deliberately narrow: exactly the two keys, each a finite three-vector. A
 * record that merely happens to contain a `position` is left to the ordinary
 * component-wise path, because treating it as an orientation would silently
 * change how it animates.
 */
export function isToolcraftOrientationValue(
  value: unknown,
): value is ToolcraftOrientationValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  const record = value as Record<string, unknown>;

  return (
    keys.length === 2 &&
    keys.includes("position") &&
    keys.includes("up") &&
    isVector3(record.position) &&
    isVector3(record.up)
  );
}

/**
 * One camera pose on the way between two others.
 *
 * The direction travels round the sphere and the distance travels straight, so
 * a camera keyed near and to the left, then far and to the right, sweeps round
 * while pulling back rather than cutting the corner. `up` is carried round the
 * same way; it is a direction too, and lerping it tips the horizon through the
 * middle of a turn that should keep it level.
 */
export function interpolateToolcraftOrientation(
  from: ToolcraftOrientationValue,
  to: ToolcraftOrientationValue,
  progress: number,
): ToolcraftOrientationValue {
  const fromDirection = normalize(from.position);
  const toDirection = normalize(to.position);

  // A pose with no direction cannot be pointed along, and there is nothing
  // better to do with it than hand back an end rather than invent one.
  if (!fromDirection || !toDirection) {
    return progress >= 1 ? to : from;
  }

  const fromDistance = magnitude(from.position);
  const distance = fromDistance + (magnitude(to.position) - fromDistance) * progress;
  const direction = slerpToolcraftUnitVectors(fromDirection, toDirection, progress);
  const fromUp = normalize(from.up);
  const toUp = normalize(to.up);

  return {
    position: direction.map((component) => component * distance),
    up: fromUp && toUp ? slerpToolcraftUnitVectors(fromUp, toUp, progress) : [...from.up],
  };
}
