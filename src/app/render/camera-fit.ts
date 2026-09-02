import * as THREE from "three";

/**
 * Where the camera stands, and how much of the set that leaves in frame.
 *
 * Extracted from the renderer because a second caller needs the same answer:
 * in Infinity canvas mode there is no artboard to fit the subject into, so the
 * app has to work out the frame the subject wants rather than being handed
 * one. Both callers deriving the camera the same way is the whole point — a
 * frame computed from a second, nearly-identical fit would crop differently
 * from the render that lands in it, and the difference would only show up as a
 * sliver of missing table.
 */

export type FitPose = Readonly<{
  position: readonly [number, number, number];
  up: readonly [number, number, number];
}>;

/** The camera's own axes for one pose: where it looks, and which way is up. */
export type FitBasis = Readonly<{
  across: THREE.Vector3;
  direction: THREE.Vector3;
  up: THREE.Vector3;
  upright: THREE.Vector3;
}>;

/** The angular half-extents a box subtends, as tangents, per screen axis. */
export type FitReach = Readonly<{ across: number; upright: number }>;

export function readFitBasis(pose: FitPose): FitBasis {
  const direction = new THREE.Vector3(
    pose.position[0],
    pose.position[1],
    pose.position[2],
  );
  if (direction.lengthSq() < 1e-6) direction.set(0, 0.6, 3.4);
  direction.normalize();

  const up = new THREE.Vector3(pose.up[0], pose.up[1], pose.up[2]);
  if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
  const across = new THREE.Vector3().crossVectors(up, direction).normalize();
  if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
  const upright = new THREE.Vector3()
    .crossVectors(direction, across)
    .normalize();
  return { across, direction, up, upright };
}

/** A focal length in 36mm full-frame terms, as a vertical field of view. */
export function fovDegreesFor(focalLength: number): number {
  return 2 * Math.atan(36 / (2 * focalLength)) * (180 / Math.PI);
}

/**
 * How much of the furniture underneath the device still has to be in shot.
 *
 * All of it on a square or tall frame, none of it by sixteen by nine.
 *
 * The frame fills its short axis with the subject and gives the long axis away
 * as margin, so on a wide frame the height goes on the table's legs and the
 * device ends up occupying a fifteenth of the picture. Letting the legs run out
 * of the bottom is what a photograph of a desk does anyway, and there is
 * nothing left to expose by doing it: the set has no rim to find any more.
 *
 * Eased across the range rather than switched at a threshold, because the
 * canvas size is a control somebody drags and a step change in the framing
 * halfway through a drag reads as a fault.
 */
export function heldBox(
  framing: THREE.Box3,
  standTop: number,
  aspect: number,
): THREE.Box3 {
  const wideness01 = THREE.MathUtils.clamp(
    (aspect - 4 / 3) / (16 / 9 - 4 / 3),
    0,
    1,
  );
  const held = new THREE.Box3().copy(framing);
  held.min.y = THREE.MathUtils.lerp(
    held.min.y,
    Math.min(standTop, held.max.y),
    wideness01,
  );
  return held;
}

/**
 * Stand back far enough that every corner of the set is inside the frame.
 *
 * A radius and a margin is the usual shortcut and it is only right for a ball.
 * What the camera has to hold here is a long low box — a laptop on a table is
 * four times wider than it is deep — and a sphere drawn round that box has to
 * reach its corners, which pushes the camera much further back than the picture
 * needs. So each of the eight corners is asked directly how far away the camera
 * would have to be for it to clear the edge of frame, and the answer is the
 * largest of them.
 *
 * Both axes are asked separately, because the frame is not square and the thing
 * being framed is not either.
 */
export function fitDistance(request: {
  aspect: number;
  basis: FitBasis;
  box: THREE.Box3;
  halfFovRad: number;
  /**
   * The product on its own, to be composed with air around it. Null cuts the
   * frame to the set and nothing more, which is what Infinity canvas wants.
   */
  subject: THREE.Box3 | null;
}): number {
  const { aspect, basis, box, halfFovRad, subject } = request;
  const tallness = Math.tan(halfFovRad);
  const wideness = tallness * Math.max(0.001, aspect);
  // Every reach is measured from the same point, because the camera looks at
  // one point: the middle of the set. A box measured about its own centre
  // would answer for a camera pointed somewhere the camera is not.
  const centre = box.getCenter(new THREE.Vector3());
  const corner = new THREE.Vector3();

  /**
   * How far back this box has to be seen from to sit inside `1 / air` of the
   * frame.
   *
   * Dividing the frame's own half-angles rather than scaling the answer, so
   * the margin is a share of the picture and not a share of the distance --
   * multiplying the distance moves the camera away from the near corners as
   * well, which leaves a squat subject with more air than a tall one at the
   * same setting.
   */
  const reach = (held: THREE.Box3, air: number): number => {
    let distance = 0;
    for (const x of [held.min.x, held.max.x]) {
      for (const y of [held.min.y, held.max.y]) {
        for (const z of [held.min.z, held.max.z]) {
          corner.set(x, y, z).sub(centre);
          const depth = corner.dot(basis.direction);
          distance = Math.max(
            distance,
            depth + (air * Math.abs(corner.dot(basis.across))) / wideness,
            depth + (air * Math.abs(corner.dot(basis.upright))) / tallness,
          );
        }
      }
    }
    return distance;
  };

  /**
   * The composition: the product inside four fifths of the frame.
   *
   * It used to be the sphere drawn round the product instead, at the same
   * margin, and a sphere is a poor stand-in for anything that is not one. A
   * phone is nearly as tall as the sphere round it and came out framed as
   * intended; a T-shirt's box is two thirds of its sphere and a clipboard's a
   * half, so both were composed for a subject much bigger than the one in
   * front of the camera. On the default 1080 by 1350 artboard the shirt filled
   * 57 per cent of the width and 43 per cent of the height -- over half the
   * picture empty backdrop -- and the tablet folder 51 by 5.
   *
   * Worse on a tall frame than a wide one, because fitting a sphere across a
   * narrow frame needs the extra distance and fitting a shirt across it does
   * not: the same rule that made the phone right made every portrait export of
   * everything else another 25 per cent too small.
   */
  const distance = Math.max(reach(box, 1), subject ? reach(subject, 1.25) : 0);
  // A hair of air, so nothing sits exactly on the edge of the picture.
  return distance * 1.02;
}

/**
 * How far the box reaches across the picture and up it, from a camera standing
 * at `distance`, measured as the tangent of the half-angle on each axis.
 *
 * The ratio of the two is the shape of the smallest frame that holds the box:
 * fill the frame with that shape and the subject touches both edges at once
 * instead of touching one and leaving margin on the other.
 */
export function fitReach(request: {
  basis: FitBasis;
  box: THREE.Box3;
  distance: number;
}): FitReach {
  const { basis, box, distance } = request;
  const centre = box.getCenter(new THREE.Vector3());
  const corner = new THREE.Vector3();
  let across = 0;
  let upright = 0;

  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z).sub(centre);
        // Depth from the camera, which stands `distance` back along its own
        // view axis from the centre of the box.
        const ahead = Math.max(1e-6, distance - corner.dot(basis.direction));
        across = Math.max(across, Math.abs(corner.dot(basis.across)) / ahead);
        upright = Math.max(upright, Math.abs(corner.dot(basis.upright)) / ahead);
      }
    }
  }
  return { across, upright };
}
