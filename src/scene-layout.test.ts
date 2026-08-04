import { describe, expect, it } from "vitest";
import { collectionStart, lerpYaw, motionTiming, playedCardYaw, relativeSeat, TRICK_SLOT_XZ } from "./scene-layout";

describe("center-trick card layout and timing", () => {
  it("uses table-plane yaw for all four seats without vertical flipping", () => {
    expect([0, 1, 2, 3].map(playedCardYaw)).toEqual([0, -Math.PI / 2, -Math.PI, -3 * Math.PI / 2]);
    expect(TRICK_SLOT_XZ).toEqual([[0, 1.22], [-1.28, 0], [0, -1.22], [1.28, 0]]);
    expect([0, 1, 2, 3].map((seat) => relativeSeat(seat, 2))).toEqual([2, 3, 0, 1]);
    expect(lerpYaw(0, -3 * Math.PI / 2, 1)).toBeCloseTo(Math.PI / 2);
  });

  it("does not collect a completed trick before the final card can land", () => {
    const timing = motionTiming(false);
    expect(collectionStart(1_100, 1_000, timing)).toBeGreaterThanOrEqual(1_000 + timing.dealMs + 90);
    const reduced = motionTiming(true);
    expect(reduced.dealMs).toBeLessThan(timing.dealMs);
    expect(reduced.sweepMs).toBeLessThan(timing.sweepMs);
  });
});
