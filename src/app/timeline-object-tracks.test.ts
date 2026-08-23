import { describe, expect, it } from "vitest";
import {
  getToolcraftTimelineObjectId,
  getToolcraftTimelineObjectKeyframesAtTime,
  getToolcraftTimelineObjectTracks,
  humanizeToolcraftTimelineObjectId,
  type ToolcraftTimelineKeyframeGroup,
} from "@/toolcraft/runtime";

function group(
  controlId: string,
  label: string,
  times: readonly number[],
): ToolcraftTimelineKeyframeGroup {
  return {
    controlId,
    keyframes: times.map((timeSeconds) => ({
      controlId,
      controlLabel: label,
      id: `${controlId}::${timeSeconds}`,
      timeSeconds,
      value: timeSeconds,
      valueLabel: String(timeSeconds),
    })),
    label,
  };
}

describe("timeline object tracks", () => {
  it("reads the object off the front of the target", () => {
    expect(getToolcraftTimelineObjectId("device.spin")).toBe("device");
    expect(getToolcraftTimelineObjectId("export.image.format")).toBe("export");
    expect(getToolcraftTimelineObjectId("zoom")).toBe("zoom");
  });

  it("names an object the way a person would", () => {
    expect(humanizeToolcraftTimelineObjectId("device")).toBe("Device");
    expect(humanizeToolcraftTimelineObjectId("keyLight")).toBe("Key light");
    expect(humanizeToolcraftTimelineObjectId("back-drop")).toBe("Back drop");
    expect(humanizeToolcraftTimelineObjectId("")).toBe("");
  });

  it("gathers a device's controls into one track", () => {
    const tracks = getToolcraftTimelineObjectTracks([
      group("device.spin", "Spin", [0, 6]),
      group("camera.orbit", "Orbit", [3]),
      group("device.finish", "Finish", [0, 2]),
    ]);

    expect(tracks.map((track) => track.objectId)).toEqual(["device", "camera"]);
    expect(tracks[0]?.label).toBe("Device");
    expect(tracks[0]?.groups.map((entry) => entry.controlId)).toEqual([
      "device.spin",
      "device.finish",
    ]);
    expect(tracks[1]?.groups.map((entry) => entry.controlId)).toEqual(["camera.orbit"]);
  });

  it("merges the moments an object moves at, in order and without repeats", () => {
    const [track] = getToolcraftTimelineObjectTracks([
      group("device.spin", "Spin", [6, 0]),
      group("device.finish", "Finish", [2, 0]),
    ]);

    expect(track?.keyframeTimes).toEqual([0, 2, 6]);
  });

  it("keeps a track in the order it was first keyed", () => {
    const tracks = getToolcraftTimelineObjectTracks([
      group("camera.orbit", "Orbit", [1]),
      group("device.spin", "Spin", [1]),
      group("camera.zoom", "Zoom", [2]),
    ]);

    expect(tracks.map((track) => track.objectId)).toEqual(["camera", "device"]);
  });

  it("finds everything an object does at one moment", () => {
    const [track] = getToolcraftTimelineObjectTracks([
      group("device.spin", "Spin", [0, 6]),
      group("device.finish", "Finish", [0]),
    ]);

    expect(
      getToolcraftTimelineObjectKeyframesAtTime(track!, 0).map((keyframe) => keyframe.id),
    ).toEqual(["device.spin::0", "device.finish::0"]);
    expect(
      getToolcraftTimelineObjectKeyframesAtTime(track!, 6).map((keyframe) => keyframe.id),
    ).toEqual(["device.spin::6"]);
  });

  it("has no tracks when nothing is keyed", () => {
    expect(getToolcraftTimelineObjectTracks([])).toEqual([]);
  });
});
