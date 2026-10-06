import { describe, expect, it } from "vitest";
import { computeSmartRewind } from "./smart-rewind";

describe("Smart Resume Rewind Engine", () => {
  it("does not rewind if disabled", () => {
    const res = computeSmartRewind(1000, 120, 200_000, { enabled: false });
    expect(res.shouldRewind).toBe(false);
    expect(res.targetPositionSeconds).toBe(120);
  });

  it("does not rewind if pause duration is under minPauseSeconds", () => {
    const now = Date.now();
    const pausedAt = now - 20_000; // 20 seconds ago
    const res = computeSmartRewind(pausedAt, 300, now, { minPauseSeconds: 45 });
    expect(res.shouldRewind).toBe(false);
    expect(res.targetPositionSeconds).toBe(300);
  });

  it("rewinds progressively based on pause duration in dynamic mode", () => {
    const now = Date.now();

    // 1. Paused for 2 minutes (120s) -> 5s rewind
    const resShort = computeSmartRewind(now - 120_000, 300, now, { dynamicMode: true });
    expect(resShort.shouldRewind).toBe(true);
    expect(resShort.rewindSeconds).toBe(5);
    expect(resShort.targetPositionSeconds).toBe(295);

    // 2. Paused for 10 minutes (600s) -> 10s rewind
    const resMedium = computeSmartRewind(now - 600_000, 300, now, { dynamicMode: true });
    expect(resMedium.shouldRewind).toBe(true);
    expect(resMedium.rewindSeconds).toBe(10);
    expect(resMedium.targetPositionSeconds).toBe(290);

    // 3. Paused for 20 minutes (1200s) -> 15s rewind
    const resLong = computeSmartRewind(now - 1200_000, 300, now, { dynamicMode: true });
    expect(resLong.shouldRewind).toBe(true);
    expect(resLong.rewindSeconds).toBe(15);
    expect(resLong.targetPositionSeconds).toBe(285);

    // 4. Paused for 2 hours (7200s) -> 25s rewind
    const resVeryLong = computeSmartRewind(now - 7200_000, 300, now, { dynamicMode: true });
    expect(resVeryLong.shouldRewind).toBe(true);
    expect(resVeryLong.rewindSeconds).toBe(25);
    expect(resVeryLong.targetPositionSeconds).toBe(275);
  });

  it("clamps rewind position at beginning of book (0 seconds)", () => {
    const now = Date.now();
    const res = computeSmartRewind(now - 600_000, 4, now, {
      rewindDurationSeconds: 10,
      dynamicMode: false,
    });
    expect(res.shouldRewind).toBe(true);
    expect(res.targetPositionSeconds).toBe(0);
    expect(res.rewindSeconds).toBe(4);
  });
});
