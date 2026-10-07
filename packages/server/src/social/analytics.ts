/**
 * audioneko: Listening Analytics, Streaks & Activity Engine
 *
 * Computes daily streaks, GitHub-style 365-day contribution heatmaps,
 * and comprehensive listening statistics.
 */

import type {
  DailyListeningData,
  ListeningAnalyticsResponse,
  RecordListeningEventRequest,
} from "@audioneko/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Database } from "../db";
import { listeningEvents, progress } from "../db/schema";

/**
 * Calculates GitHub-style heatmap intensity (0 to 4)
 */
export function calculateHeatmapIntensity(seconds: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0) return 0;
  if (seconds < 15 * 60) return 1; // < 15 min
  if (seconds < 45 * 60) return 2; // 15 - 45 min
  if (seconds < 120 * 60) return 3; // 45 min - 2h
  return 4; // > 2h
}

/**
 * Formats a Date into ISO date string "YYYY-MM-DD"
 */
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Computes consecutive days streak ending today or yesterday
 */
export function computeStreaks(
  activeDatesSet: Set<string>,
  referenceTodayStr?: string,
): {
  currentStreak: number;
  longestStreak: number;
} {
  if (activeDatesSet.size === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Sorted unique date strings ascending
  const sortedDates = Array.from(activeDatesSet).sort();

  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const dateStr of sortedDates) {
    const curDate = new Date(`${dateStr}T00:00:00Z`);

    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diffDays = Math.round((curDate.getTime() - prevDate.getTime()) / (1000 * 86400));
      if (diffDays === 1) {
        tempStreak++;
      } else if (diffDays > 1) {
        tempStreak = 1;
      }
    }

    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }
    prevDate = curDate;
  }

  // Determine current streak: does it include today or yesterday?
  const today = referenceTodayStr || formatIsoDate(new Date());
  const todayDate = new Date(`${today}T00:00:00Z`);
  const yesterdayDate = new Date(todayDate.getTime() - 86400 * 1000);
  const yesterday = formatIsoDate(yesterdayDate);

  let currentStreak = 0;
  if (activeDatesSet.has(today) || activeDatesSet.has(yesterday)) {
    const checkDate = activeDatesSet.has(today) ? new Date(todayDate) : yesterdayDate;

    while (true) {
      const dateKey = formatIsoDate(checkDate);
      if (activeDatesSet.has(dateKey)) {
        currentStreak++;
        checkDate.setUTCDate(checkDate.getUTCDate() - 1);
      } else {
        break;
      }
    }
  }

  return { currentStreak, longestStreak };
}

/**
 * Records a listening event from client playback
 */
export async function recordListeningEvent(
  userId: string,
  event: RecordListeningEventRequest,
  db: Database,
): Promise<{ id: string; recorded: boolean }> {
  const eventId = `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const timestamp = event.timestamp || Math.floor(Date.now() / 1000);

  await db.insert(listeningEvents).values({
    id: eventId,
    userId,
    bookId: event.bookId,
    startTimeSeconds: event.startTimeSeconds,
    endTimeSeconds: event.endTimeSeconds,
    durationListenedSeconds: event.durationListenedSeconds,
    playbackRate: event.playbackRate || 1.0,
    timestamp,
  });

  return { id: eventId, recorded: true };
}

/**
 * Generates full listening analytics, streaks, and 365-day activity heatmap
 */
export async function getUserListeningAnalytics(
  userId: string,
  db: Database,
  tzOffsetMinutes = 0,
): Promise<ListeningAnalyticsResponse> {
  const oneYearAgoTimestamp = Math.floor(Date.now() / 1000) - 365 * 86400;

  // 1. Fetch listening events for the user in the past 365 days
  const events = await db
    .select({
      duration: listeningEvents.durationListenedSeconds,
      timestamp: listeningEvents.timestamp,
      playbackRate: listeningEvents.playbackRate,
    })
    .from(listeningEvents)
    .where(
      and(eq(listeningEvents.userId, userId), gte(listeningEvents.timestamp, oneYearAgoTimestamp)),
    )
    .all();

  // 2. Fetch completed books count
  const completedBooks = await db
    .select({ count: sql<number>`count(*)` })
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.isFinished, true)))
    .all();

  const totalBooksCompleted = completedBooks[0]?.count || 0;

  // 3. Aggregate daily listening totals and listening velocity shifted to user's local timezone
  const tzShiftSec = tzOffsetMinutes * 60;
  const dailyMap = new Map<string, { seconds: number; count: number }>();
  let totalListenedSeconds = 0;
  let weightedRateSum = 0;
  let totalDurationForRate = 0;
  const sevenDaysAgoTs = Math.floor(Date.now() / 1000) - 7 * 86400;
  let weeklySeconds = 0;
  const hourBuckets = new Array(24).fill(0);

  for (const ev of events) {
    const localMs = (ev.timestamp + tzShiftSec) * 1000;
    const evDate = new Date(localMs);
    const dateKey = formatIsoDate(evDate);
    totalListenedSeconds += ev.duration;

    if (ev.playbackRate && ev.duration > 0) {
      weightedRateSum += ev.playbackRate * ev.duration;
      totalDurationForRate += ev.duration;
    }
    if (ev.timestamp >= sevenDaysAgoTs) {
      weeklySeconds += ev.duration;
    }
    const evHour = evDate.getUTCHours();
    hourBuckets[evHour] = (hourBuckets[evHour] || 0) + ev.duration;

    const existing = dailyMap.get(dateKey) || { seconds: 0, count: 0 };
    existing.seconds += ev.duration;
    existing.count += 1;
    dailyMap.set(dateKey, existing);
  }

  const averagePlaybackRate =
    totalDurationForRate > 0 ? Number((weightedRateSum / totalDurationForRate).toFixed(2)) : 1.0;
  const weeklyVelocityMinutes = Math.round(weeklySeconds / 60);

  let peakListeningHour = 20;
  let maxHourSec = 0;
  for (let h = 0; h < 24; h++) {
    if (hourBuckets[h] > maxHourSec) {
      maxHourSec = hourBuckets[h];
      peakListeningHour = h;
    }
  }

  // 4. Compute streak statistics
  const activeDatesSet = new Set<string>();
  for (const [date, data] of dailyMap.entries()) {
    if (data.seconds >= 60) {
      // At least 1 minute of active listening to count toward streak
      activeDatesSet.add(date);
    }
  }

  const nowLocalMs = Date.now() + tzShiftSec * 1000;
  const localTodayDate = new Date(nowLocalMs);
  const localTodayStr = formatIsoDate(localTodayDate);
  const { currentStreak, longestStreak } = computeStreaks(activeDatesSet, localTodayStr);

  // 5. Construct full 365-day grid history
  const dailyHistory: DailyListeningData[] = [];
  let todaySeconds = 0;

  for (let i = 364; i >= 0; i--) {
    const d = new Date(nowLocalMs - i * 86400 * 1000);
    const dateStr = formatIsoDate(d);
    const data = dailyMap.get(dateStr) || { seconds: 0, count: 0 };

    if (i === 0) {
      todaySeconds = data.seconds;
    }

    dailyHistory.push({
      date: dateStr,
      secondsListened: Math.round(data.seconds),
      eventsCount: data.count,
      intensity: calculateHeatmapIntensity(data.seconds),
    });
  }

  const activeDaysCount = activeDatesSet.size;
  const averageDailySeconds =
    activeDaysCount > 0 ? Math.round(totalListenedSeconds / activeDaysCount) : 0;

  return {
    currentStreakDays: currentStreak,
    longestStreakDays: longestStreak,
    totalListenedSeconds: Math.round(totalListenedSeconds),
    totalBooksCompleted,
    todayListenedSeconds: Math.round(todaySeconds),
    averageDailySeconds,
    averagePlaybackRate,
    weeklyVelocityMinutes,
    peakListeningHour,
    dailyHistory,
  };
}
