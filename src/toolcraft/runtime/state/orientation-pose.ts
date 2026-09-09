export type ToolcraftOrientationPose = Readonly<{
  position: readonly [number, number, number];
  up: readonly [number, number, number];
}>;

export const DEFAULT_TOOLCRAFT_ORIENTATION_POSE: ToolcraftOrientationPose = {
  position: [0, 0, 5],
  up: [0, 1, 0],
};

const minimumLengthSquared = 1e-12;

function clonePose(
  pose: ToolcraftOrientationPose,
): ToolcraftOrientationPose {
  return {
    position: [...pose.position],
    up: [...pose.up],
  };
}

function readFiniteTuple(value: unknown): [number, number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  ) {
    return null;
  }

  return [value[0], value[1], value[2]];
}

function isUsablePose(pose: ToolcraftOrientationPose): boolean {
  const squaredLength = (value: readonly [number, number, number]) =>
    value[0] * value[0] + value[1] * value[1] + value[2] * value[2];
  const cross: [number, number, number] = [
    pose.up[1] * pose.position[2] - pose.up[2] * pose.position[1],
    pose.up[2] * pose.position[0] - pose.up[0] * pose.position[2],
    pose.up[0] * pose.position[1] - pose.up[1] * pose.position[0],
  ];

  return (
    squaredLength(pose.position) > minimumLengthSquared &&
    squaredLength(pose.up) > minimumLengthSquared &&
    squaredLength(cross) > minimumLengthSquared
  );
}

export function decodeToolcraftOrientationPose(
  value: unknown,
): ToolcraftOrientationPose | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const position = readFiniteTuple(record.position);
  const up = readFiniteTuple(record.up);

  if (!position || !up) {
    return null;
  }

  const pose = { position, up };
  return isUsablePose(pose) ? clonePose(pose) : null;
}

/**
 * A pose in the two numbers somebody would recognise.
 *
 * Yaw and pitch in degrees, which are exactly what the two axes of a drag
 * change. The stored value is two three-vectors, and "0.36, 0.14, 1" says
 * nothing about where the camera is standing — which matters wherever a pose
 * has to be named rather than drawn, a keyframe's tooltip being the first
 * place. A value that is not a usable pose has no angles to report, so it is
 * named for what it is rather than given a made-up zero.
 */
export function describeToolcraftOrientationPose(value: unknown): string {
  const pose = decodeToolcraftOrientationPose(value);

  if (!pose) {
    return "Pose";
  }

  const [x, y, z] = pose.position;
  const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);

  return `${degrees(Math.atan2(x, z))}°, ${degrees(Math.asin(y / Math.hypot(x, y, z)))}°`;
}

export function readToolcraftOrientationPose(
  value: unknown,
  fallback: ToolcraftOrientationPose = DEFAULT_TOOLCRAFT_ORIENTATION_POSE,
): ToolcraftOrientationPose {
  return (
    decodeToolcraftOrientationPose(value) ??
    decodeToolcraftOrientationPose(fallback) ??
    clonePose(DEFAULT_TOOLCRAFT_ORIENTATION_POSE)
  );
}
