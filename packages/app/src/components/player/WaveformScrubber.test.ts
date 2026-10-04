import { describe, expect, it } from "vitest";
import { formatScrubberTime, getScrubSpeedFromDelta } from "./WaveformScrubber";

describe("WaveformScrubber Logic & Decelerated Scrubbing Tiers", () => {
  it("formats seconds into hh:mm:ss or mm:ss accurately", () => {
    expect(formatScrubberTime(0)).toBe("0:00");
    expect(formatScrubberTime(45)).toBe("0:45");
    expect(formatScrubberTime(125)).toBe("2:05");
    expect(formatScrubberTime(3665)).toBe("1:01:05");
    expect(formatScrubberTime(7200)).toBe("2:00:00");
    expect(formatScrubberTime(-10)).toBe("0:00");
  });

  it("calculates 1.0x normal speed tier when vertical drag delta < 35px", () => {
    const res0 = getScrubSpeedFromDelta(0);
    expect(res0.multiplier).toBe(1.0);
    expect(res0.tier).toBe("1.0x");

    const res25 = getScrubSpeedFromDelta(25);
    expect(res25.multiplier).toBe(1.0);
    expect(res25.tier).toBe("1.0x");
  });

  it("calculates 0.5x half speed tier when vertical drag delta is between 35px and 79px", () => {
    const res35 = getScrubSpeedFromDelta(35);
    expect(res35.multiplier).toBe(0.5);
    expect(res35.tier).toBe("0.5x");

    const res60 = getScrubSpeedFromDelta(60);
    expect(res60.multiplier).toBe(0.5);
  });

  it("calculates 0.25x quarter speed tier when vertical drag delta is between 80px and 139px", () => {
    const res80 = getScrubSpeedFromDelta(80);
    expect(res80.multiplier).toBe(0.25);
    expect(res80.tier).toBe("0.25x");

    const res120 = getScrubSpeedFromDelta(120);
    expect(res120.multiplier).toBe(0.25);
  });

  it("calculates 0.1x fine scrub tier when vertical drag delta >= 140px", () => {
    const res140 = getScrubSpeedFromDelta(140);
    expect(res140.multiplier).toBe(0.1);
    expect(res140.tier).toBe("0.1x");

    const res250 = getScrubSpeedFromDelta(250);
    expect(res250.multiplier).toBe(0.1);
  });
});
