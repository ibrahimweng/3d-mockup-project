import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSceneRetryCount,
  getSceneStatus,
  resetSceneStatusForTests,
  retryScene,
  setSceneStatus,
  subscribeToSceneStatus,
} from "./scene-status";

afterEach(resetSceneStatusForTests);

describe("what the scene says it is doing", () => {
  it("says nothing at all until something happens", () => {
    // A studio that is working is a picture, and a picture needs no caption.
    expect(getSceneStatus()).toEqual({ kind: "ready" });
  });

  it("tells its listeners when the answer changes", () => {
    const heard = vi.fn();
    subscribeToSceneStatus(heard);

    setSceneStatus({ device: "macbook", kind: "loading" });
    expect(getSceneStatus()).toEqual({ device: "macbook", kind: "loading" });
    expect(heard).toHaveBeenCalledTimes(1);

    setSceneStatus({ kind: "ready" });
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("says nothing when the answer has not changed", () => {
    // The renderer reports on every settings pass, and most passes change
    // nothing. Announcing each one would re-render the report sixty times a
    // second to say the same word.
    const heard = vi.fn();
    subscribeToSceneStatus(heard);

    setSceneStatus({ device: "tshirt", kind: "loading" });
    setSceneStatus({ device: "tshirt", kind: "loading" });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("hears a second product loading while the first still is", () => {
    // Clicking through three products before the first arrives is an ordinary
    // impatient thing to do, and the name in the message has to keep up.
    const heard = vi.fn();
    subscribeToSceneStatus(heard);

    setSceneStatus({ device: "tshirt", kind: "loading" });
    setSceneStatus({ device: "tote-bag", kind: "loading" });
    expect(getSceneStatus()).toEqual({ device: "tote-bag", kind: "loading" });
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe("a browser that cannot draw at all", () => {
  it("keeps saying so, whatever the renderer reports next", () => {
    // A machine with no WebGL is not going to grow some. Letting a later
    // "loading" through would replace the one true explanation with a spinner
    // that never finishes.
    setSceneStatus({ kind: "unavailable" });
    setSceneStatus({ device: "macbook", kind: "loading" });
    setSceneStatus({ kind: "ready" });

    expect(getSceneStatus()).toEqual({ kind: "unavailable" });
  });
});

describe("trying a failed load again", () => {
  it("goes back to loading and asks the preview for a fresh attempt", () => {
    setSceneStatus({ device: "macbook", kind: "failed" });
    expect(getSceneRetryCount()).toBe(0);

    retryScene();

    expect(getSceneStatus()).toEqual({ device: "macbook", kind: "loading" });
    // The count is what the preview watches, so it has to move for the attempt
    // to be a real one rather than a cache hit.
    expect(getSceneRetryCount()).toBe(1);
  });

  it("does nothing when there is nothing to retry", () => {
    // Otherwise a stray press while a product is on its way would put the
    // studio back to loading something that is already loading.
    setSceneStatus({ device: "macbook", kind: "loading" });
    retryScene();

    expect(getSceneRetryCount()).toBe(0);
    expect(getSceneStatus()).toEqual({ device: "macbook", kind: "loading" });
  });
});
