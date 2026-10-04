import { beforeEach, describe, expect, it, vi } from "vitest";
import { FADE_WINDOW_SECONDS, SleepTimer } from "./sleep-timer";

describe("SleepTimer & Fade-Out Logic", () => {
  let timer: SleepTimer;
  let onExpire: ReturnType<typeof vi.fn>;
  let onExtend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onExpire = vi.fn();
    onExtend = vi.fn();
    timer = new SleepTimer({
      onExpire,
      onExtend,
    });
  });

  it("starts a preset countdown correctly", () => {
    timer.start(15);
    const state = timer.getState();

    expect(state.isActive).toBe(true);
    expect(state.preset).toBe(15);
    expect(state.remainingSeconds).toBe(900);
    expect(state.volumeMultiplier).toBe(1.0);
    expect(state.isFadingOut).toBe(false);
  });

  it("computes smooth linear volume fade during the final 30 seconds", () => {
    const baseTime = 1000000;
    vi.setSystemTime(baseTime);

    timer.start(5); // 300 seconds

    // Advance to 20 seconds before end (280s passed, 20s remaining)
    const timeAt20sRemaining = baseTime + 280 * 1000;
    timer.tick(timeAt20sRemaining);

    let state = timer.getState();
    expect(state.remainingSeconds).toBe(20);
    expect(state.isFadingOut).toBe(true);
    // 20s / 30s = 0.666...
    expect(state.volumeMultiplier).toBeCloseTo(20 / FADE_WINDOW_SECONDS, 2);

    // Advance to 10 seconds before end
    const timeAt10sRemaining = baseTime + 290 * 1000;
    timer.tick(timeAt10sRemaining);

    state = timer.getState();
    expect(state.remainingSeconds).toBe(10);
    expect(state.volumeMultiplier).toBeCloseTo(10 / FADE_WINDOW_SECONDS, 2);
  });

  it("fires onExpire and resets volume when countdown completes", () => {
    const baseTime = 1000000;
    vi.setSystemTime(baseTime);

    timer.start(5); // 300s

    const timeAtEnd = baseTime + 301 * 1000;
    timer.tick(timeAtEnd);

    const state = timer.getState();
    expect(state.isActive).toBe(false);
    expect(state.remainingSeconds).toBe(0);
    expect(state.volumeMultiplier).toBe(0.0);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("calculates end-of-chapter mode accurately", () => {
    timer.start("end-of-chapter", {
      currentPosition: 120,
      chapterEnd: 300,
    });

    const state = timer.getState();
    expect(state.isActive).toBe(true);
    expect(state.preset).toBe("end-of-chapter");
    expect(state.remainingSeconds).toBe(180); // 300 - 120
  });

  it("extends an active timer by +15 minutes and restores full volume", () => {
    const baseTime = 1000000;
    vi.setSystemTime(baseTime);

    timer.start(5);
    // Advance into fade-out (15 seconds remaining)
    vi.setSystemTime(baseTime + 285 * 1000);
    timer.tick();
    expect(timer.getState().isFadingOut).toBe(true);

    // Shake or click extend
    timer.extend(15);

    const state = timer.getState();
    expect(state.remainingSeconds).toBe(15 + 15 * 60); // 15s + 900s = 915s
    expect(state.isFadingOut).toBe(false);
    expect(state.volumeMultiplier).toBe(1.0);
    expect(onExtend).toHaveBeenCalledWith(900);
  });

  it("cancels and resets state immediately", () => {
    timer.start(30);
    expect(timer.getState().isActive).toBe(true);

    timer.cancel();

    const state = timer.getState();
    expect(state.isActive).toBe(false);
    expect(state.remainingSeconds).toBe(0);
    expect(state.preset).toBeNull();
  });
});
