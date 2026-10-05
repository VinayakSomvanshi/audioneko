import { describe, expect, it } from "vitest";
import { computeClockSlewing, computeTargetHostPosition } from "./slewing";

describe("Audio Clock Slewing & Listen-Along Synchronizer", () => {
  it("computes expected host position factoring in elapsed time and playback rate", () => {
    // 10 seconds elapsed at 1.0x -> +10 seconds
    const pos1 = computeTargetHostPosition(100, 1000, 11000, 1.0, true);
    expect(pos1).toBe(110);

    // 10 seconds elapsed at 1.5x -> +15 seconds
    const pos2 = computeTargetHostPosition(100, 1000, 11000, 1.5, true);
    expect(pos2).toBe(115);

    // When paused, host position remains static regardless of elapsed time
    const pos3 = computeTargetHostPosition(100, 1000, 11000, 1.0, false);
    expect(pos3).toBe(100);
  });

  it("detects in-sync state when follower is within 50ms tolerance", () => {
    const res = computeClockSlewing(100.02, 100.0, 1.0, true);
    expect(res.status).toBe("in_sync");
    expect(res.requiresHardSeek).toBe(false);
    expect(res.targetRate).toBe(1.0);
  });

  it("slews rate up (+5%) when follower is slightly behind host (50ms to 2000ms)", () => {
    // Follower is at 100.0, host target is 100.3 (300ms behind)
    const res = computeClockSlewing(100.3, 100.0, 1.0, true);
    expect(res.status).toBe("slewing_up");
    expect(res.requiresHardSeek).toBe(false);
    expect(res.targetRate).toBe(1.05);

    // At baseRate 1.5x, rate becomes 1.575
    const resFast = computeClockSlewing(100.3, 100.0, 1.5, true);
    expect(resFast.targetRate).toBe(1.575);
  });

  it("slews rate down (-5%) when follower is slightly ahead of host (-50ms to -2000ms)", () => {
    // Follower is at 100.5, host target is 100.1 (400ms ahead)
    const res = computeClockSlewing(100.1, 100.5, 1.0, true);
    expect(res.status).toBe("slewing_down");
    expect(res.requiresHardSeek).toBe(false);
    expect(res.targetRate).toBe(0.95);
  });

  it("triggers hard seek when follower is severely out of sync (> 2.0s)", () => {
    // Follower is at 100.0, host target is 115.0 (15 seconds behind)
    const res = computeClockSlewing(115.0, 100.0, 1.0, true);
    expect(res.status).toBe("hard_seek");
    expect(res.requiresHardSeek).toBe(true);
    expect(res.seekTargetSeconds).toBe(115.0);
    expect(res.targetRate).toBe(1.0);
  });

  it("handles paused state correctly", () => {
    // Both paused at same spot
    const res1 = computeClockSlewing(100.0, 100.0, 1.0, false);
    expect(res1.status).toBe("paused");
    expect(res1.requiresHardSeek).toBe(false);

    // Paused with significant offset
    const res2 = computeClockSlewing(150.0, 100.0, 1.0, false);
    expect(res2.status).toBe("paused");
    expect(res2.requiresHardSeek).toBe(true);
    expect(res2.seekTargetSeconds).toBe(150.0);
  });
});
