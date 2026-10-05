import { describe, expect, it, vi } from "vitest";
import type { Database } from "../db";
import {
  calculateHeatmapIntensity,
  computeStreaks,
  formatIsoDate,
  getUserListeningAnalytics,
  recordListeningEvent,
} from "./analytics";

describe("Listening Analytics & Streaks Engine", () => {
  it("calculates GitHub-style contribution heatmap intensities accurately", () => {
    expect(calculateHeatmapIntensity(0)).toBe(0);
    expect(calculateHeatmapIntensity(-10)).toBe(0);

    // Tier 1: 1 - 900s (< 15 min)
    expect(calculateHeatmapIntensity(60)).toBe(1);
    expect(calculateHeatmapIntensity(899)).toBe(1);

    // Tier 2: 900 - 2700s (15 - 45 min)
    expect(calculateHeatmapIntensity(900)).toBe(2);
    expect(calculateHeatmapIntensity(2699)).toBe(2);

    // Tier 3: 2700 - 7200s (45 min - 2h)
    expect(calculateHeatmapIntensity(2700)).toBe(3);
    expect(calculateHeatmapIntensity(7199)).toBe(3);

    // Tier 4: >= 7200s (> 2h)
    expect(calculateHeatmapIntensity(7200)).toBe(4);
    expect(calculateHeatmapIntensity(15000)).toBe(4);
  });

  it("computes consecutive streaks and longest historical streaks correctly", () => {
    const today = formatIsoDate(new Date());
    const yesterdayDate = new Date();
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = formatIsoDate(yesterdayDate);

    const twoDaysAgoDate = new Date();
    twoDaysAgoDate.setUTCDate(twoDaysAgoDate.getUTCDate() - 2);
    const twoDaysAgo = formatIsoDate(twoDaysAgoDate);

    // Case 1: 3-day active streak ending today
    const set1 = new Set([twoDaysAgo, yesterday, today]);
    const res1 = computeStreaks(set1);
    expect(res1.currentStreak).toBe(3);
    expect(res1.longestStreak).toBe(3);

    // Case 2: Streak ending yesterday (listener hasn't listened yet today, streak still preserved)
    const set2 = new Set([twoDaysAgo, yesterday]);
    const res2 = computeStreaks(set2);
    expect(res2.currentStreak).toBe(2);
    expect(res2.longestStreak).toBe(2);

    // Case 3: Gap in streaks: a 5-day historical streak, then broken, then a 2-day current streak
    const set3 = new Set([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05", // 5 days
      yesterday,
      today, // 2 days current
    ]);
    const res3 = computeStreaks(set3);
    expect(res3.currentStreak).toBe(2);
    expect(res3.longestStreak).toBe(5);

    // Case 4: Empty set
    const res4 = computeStreaks(new Set());
    expect(res4.currentStreak).toBe(0);
    expect(res4.longestStreak).toBe(0);
  });

  it("records listening event to D1 listening_events table", async () => {
    let insertedValues: unknown;
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          insertedValues = val;
          return Promise.resolve();
        }),
      }),
    } as unknown as Database;

    const res = await recordListeningEvent(
      "user_123",
      {
        bookId: "book_456",
        startTimeSeconds: 100,
        endTimeSeconds: 340,
        durationListenedSeconds: 240,
        playbackRate: 1.25,
      },
      mockDb,
    );

    expect(res.recorded).toBe(true);
    expect(res.id).toMatch(/^evt_[a-f0-9]{16}$/);
    expect(insertedValues).toEqual(
      expect.objectContaining({
        userId: "user_123",
        bookId: "book_456",
        startTimeSeconds: 100,
        endTimeSeconds: 340,
        durationListenedSeconds: 240,
        playbackRate: 1.25,
      }),
    );
  });

  it("generates 365-day grid and listening analytics summary", async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockDb = {
      select: vi.fn().mockImplementation((fields) => {
        if ("count" in fields) {
          // Completed books query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue([{ count: 4 }]),
              }),
            }),
          };
        }
        // Listening events query
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue([
                { duration: 1800, timestamp: now }, // 30 min today
                { duration: 3600, timestamp: now - 86400 }, // 60 min yesterday
              ]),
            }),
          }),
        };
      }),
    } as unknown as Database;

    const summary = await getUserListeningAnalytics("user_123", mockDb);

    expect(summary.totalBooksCompleted).toBe(4);
    expect(summary.totalListenedSeconds).toBe(5400); // 1800 + 3600
    expect(summary.todayListenedSeconds).toBe(1800);
    expect(summary.currentStreakDays).toBe(2);
    expect(summary.longestStreakDays).toBe(2);
    expect(summary.dailyHistory).toHaveLength(365);
    // Today's entry is the last element
    const todayEntry = summary.dailyHistory[summary.dailyHistory.length - 1];
    expect(todayEntry?.secondsListened).toBe(1800);
    expect(todayEntry?.intensity).toBe(2);
  });
});
