import * as THREE from "three";

import type { ToolcraftSceneRect, ToolcraftState } from "@/toolcraft/runtime";
import { readToolcraftOrientationPose } from "@/toolcraft/runtime/react";

import { readDeviceDefinition } from "./product-domain";
import { getDevicePose } from "./render/device-pose";
import {
  fitDistance,
  fitReach,
  fovDegreesFor,
  heldBox,
  readFitBasis,
  sweptSubjectBox,
} from "./render/camera-fit";
import { TABLE_YAW } from "./render/set-geometry";
import type { RasterSettings } from "./render/raster-renderer";
import { readFramingTransform, readRasterSettings } from "./render/settings";
import { readSurfaceId } from "./surfaces";

/**
 * The rectangle an Infinity canvas export is cropped to.
 *
 * A finite canvas is an artboard: the user picks its shape and the camera fits
 * the set into whatever they picked, which fills the short axis and spends the
 * long one on margin. Infinity has no artboard, so there is nothing to fit
 * into — and a made-up rectangle standing in for one is exactly the export
 * nobody wants, a phone in the middle of a field of backdrop.
 *
 * So the frame is derived the other way round. The set is measured, the camera
 * is placed by the same fit the renderer uses, and the picture is cut to the
 * shape the set subtends: the device touches both edges rather than one. That is
 * the whole of "crops to the union of visible scene elements" for a rendered
 * scene — the backdrop and the floor are not elements the frame has to hold,
 * they are what fills whatever frame it is given, and a set with no rim to
 * find has no outer edge to union with.
 *
 * Zoom and the framing pad deliberately stay out of it. Both are choices made
 * inside the picture — one crops it, the other slides the subject off centre —
 * and a frame that grew to chase a subject the user had just pushed out of it
 * would make the two controls impossible to use. Where the product itself is
 * standing is not one of those: the renderer re-measures the set every time
 * the turntable moves, so the frame has to be measured off the posed set too
 * or the two stop describing the same picture.
 */

/** The long edge of an infinite frame, matching the finite default's. */
const LONG_EDGE = 1350;

/**
 * As far as the shape is allowed to go.
 *
 * A device seen exactly edge-on subtends almost nothing across, and the honest
 * answer there is a frame hundreds of times wider than it is tall. The clamp is
 * what stops one degree of orbit from turning the export into a strip.
 */
const WIDEST = 3;

/**
 * The set, in multiples of the device's own bounding sphere.
 *
 * Scale cancels out of everything below — only the shape of the box decides
 * the shape of the frame — so the sphere is one unit and the device's measured
 * proportions are the box.
 *
 * Posed, because the renderer frames the device where it is standing and not
 * where it was measured. Reading the catalog's resting proportions instead
 * gave a frame that answered a question the picture was no longer being asked:
 * leaned or scaled, the device no longer filled the frame drawn for it.
 *
 * Swept about the vertical, for the same reason and by the same rule the
 * renderer uses. This frame is the shape the export is cut to, so if it
 * tracked the spin angle the crop would breathe over a turntable exactly as
 * the camera used to — and worse, it would breathe out of step with a camera
 * that no longer does. `measureFraming` and this both take the cylinder the
 * device sweeps, so the two agree at every angle, which is the whole reason
 * this file shares the renderer's arithmetic rather than restating it.
 *
 * The cost is honest and worth naming: a stable frame has to hold the widest
 * presentation, so a device parked at forty-five degrees is framed for the
 * turn it could make rather than the turn it has made, and carries some
 * backdrop either side that the old per-angle frame cut away.
 */
function measureSet(
  settings: RasterSettings,
): Readonly<{ framing: THREE.Box3; standTop: number }> {
  const device = readDeviceDefinition(settings.device);
  const half = new THREE.Vector3(...device.frame);
  const standTop = -half.y;

  // The same arithmetic the scene poses the turntable by, on the same box, in
  // the same order: scale, then turn, then stand it back on the floor. A
  // radius of one because `frame` is already the box over its own bounding
  // radius, which is the unit every offset here is counted in.
  // The pose the framing is measured from, which is the product's own pose
  // while Auto frame is on and the pose it was switched off at while it is
  // off. The crop is the shape the export is cut to, so it has to freeze on
  // exactly the same rule the camera does or the two would part company.
  const pose = getDevicePose({
    half,
    radius: 1,
    transform: { ...readFramingTransform(settings), spin: settings.spin },
  });
  const framingTransform = readFramingTransform(settings);
  const framing = sweptSubjectBox({
    half,
    position: pose.position,
    rollDegrees: framingTransform.roll,
    scale: pose.scale,
    tiltDegrees: framingTransform.tilt,
  });

  // The device is offered a table only if one was drawn for it, which is the
  // same question `applySurface` asks before it builds one.
  const surface = device.surface;
  if (surface && readSurfaceId(settings.surface.kind) !== "none") {
    const turn = new THREE.Matrix4().makeRotationY(TABLE_YAW);
    const corner = new THREE.Vector3();
    for (const x of [-surface.left, surface.right]) {
      for (const z of [-surface.back, surface.front]) {
        for (const y of [0, -surface.stand]) {
          corner.set(x, standTop + y, z).applyMatrix4(turn);
          framing.expandByPoint(corner);
        }
      }
    }
  }
  return { framing, standTop };
}

/**
 * The shape of the smallest frame that holds the set.
 *
 * There is a loop here because the two ends depend on each other: how far back
 * the camera stands depends on the shape of the frame, and the shape of the
 * frame is measured from where the camera is standing. Guessing square and
 * re-asking converges on the frame that answers itself, and it does so in a
 * handful of rounds because each answer is much closer than the guess was.
 *
 * Halving each step rather than taking it whole is what keeps a set whose two
 * answers straddle the ease on the table's legs from ringing between them
 * instead of settling.
 */
function tightAspect(state: ToolcraftState): number {
  const values = state.values as Record<string, unknown>;
  const settings = readRasterSettings(values);
  const { framing, standTop } = measureSet(settings);
  const basis = readFitBasis(readToolcraftOrientationPose(values["camera.orbit"]));
  const halfFovRad =
    THREE.MathUtils.degToRad(fovDegreesFor(settings.focalLength)) / 2;

  let aspect = 1;
  for (let round = 0; round < 24; round += 1) {
    const box = heldBox(framing, standTop, aspect);
    const reach = fitReach({
      basis,
      box,
      distance: fitDistance({
        aspect,
        basis,
        box,
        halfFovRad,
        // No composition, so the fit is the box and nothing else. The renderer
        // drops the same rule for the same frame, which is what makes the
        // picture fill the rectangle measured here rather than sit in the
        // middle of it.
        subject: null,
      }),
    });
    const wanted = THREE.MathUtils.clamp(
      reach.upright > 1e-9 ? reach.across / reach.upright : 1,
      1 / WIDEST,
      WIDEST,
    );
    const settled = Math.abs(wanted - aspect) < 1e-4;
    aspect += (wanted - aspect) / 2;
    if (settled) break;
  }
  return aspect;
}

/**
 * The product's contribution to the infinite scene union.
 *
 * Centred on the world origin because that is where the device stands: the
 * scene builder recentres every model on its own bounding box before anything
 * else happens, so the subject has no offset to carry into the frame.
 *
 * Both edges are even, which keeps the corner on a whole pixel and the
 * runtime's outward rounding a no-op — an export one pixel larger than the
 * rectangle it reported would be a small lie in the one place this is measured.
 */
export function getMockupSceneRect(state: ToolcraftState): ToolcraftSceneRect {
  const aspect = tightAspect(state);
  const even = (value: number): number =>
    Math.max(2, Math.round(value / 2) * 2);
  const width = aspect >= 1 ? LONG_EDGE : even(LONG_EDGE * aspect);
  const height = aspect >= 1 ? even(LONG_EDGE / aspect) : LONG_EDGE;
  return { height, width, x: -width / 2, y: -height / 2 };
}
