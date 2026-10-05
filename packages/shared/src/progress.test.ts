import { describe, expect, it } from "vitest";
import {
  COMPLETION_HEADROOM_SECONDS,
  getPlaybackPercent,
  isPlaybackCompleted,
  isPlaybackInProgress,
} from "./progress";

describe("Playback Progress & Completion Rules", () => {
  const duration = 3600; // 1 hour

  it("handles unstarted book", () => {
    expect(isPlaybackCompleted(0, duration)).toBe(false);
    expect(isPlaybackInProgress(0, duration)).toBe(false);
    expect(getPlaybackPercent(0, duration)).toBe(0);
  });

  it("detects in-progress book", () => {
    expect(isPlaybackCompleted(10, duration)).toBe(false);
    expect(isPlaybackInProgress(10, duration)).toBe(true);
    expect(getPlaybackPercent(1800, duration)).toBe(50);
  });

  it("considers book completed when within 30-second credit headroom", () => {
    // 25 seconds left (skipped credits)
    const pos = duration - 25;
    expect(isPlaybackCompleted(pos, duration)).toBe(true);
    expect(isPlaybackInProgress(pos, duration)).toBe(false);
    expect(getPlaybackPercent(pos, duration)).toBe(99);
  });

  it("considers book completed exactly at 30-second credit headroom", () => {
    const pos = duration - COMPLETION_HEADROOM_SECONDS;
    expect(isPlaybackCompleted(pos, duration)).toBe(true);
    expect(isPlaybackInProgress(pos, duration)).toBe(false);
  });

  it("considers book completed when >= 98% has been listened to", () => {
    // 10 hour audiobook (36,000s). 98.5% is 35,460s (540s of credits remaining)
    const longDuration = 36000;
    const pos = 35500;
    expect(isPlaybackCompleted(pos, longDuration)).toBe(true);
    expect(isPlaybackInProgress(pos, longDuration)).toBe(false);
  });

  it("handles reset to 0:00 correctly", () => {
    expect(isPlaybackCompleted(0, duration)).toBe(false);
    expect(isPlaybackInProgress(0, duration)).toBe(false);
    expect(getPlaybackPercent(0, duration)).toBe(0);
  });
});
