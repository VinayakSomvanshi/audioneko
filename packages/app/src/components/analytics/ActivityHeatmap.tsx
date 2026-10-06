import type { DailyListeningData, ListeningAnalyticsResponse } from "@audioneko/shared";
import { BookCheck, Calendar, Clock, Flame, Gauge, Sun, Trophy, Zap } from "lucide-react";
import { useState } from "react";

interface ActivityHeatmapProps {
  analytics: ListeningAnalyticsResponse;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = (seconds / 3600).toFixed(1);
  return `${hours}h`;
}

function formatPeakHour(hour?: number): string {
  if (hour === undefined || hour === null) return "Evening";
  const ampm = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h}:00 ${ampm}`;
}

export function ActivityHeatmap({ analytics }: ActivityHeatmapProps) {
  const [hoveredDay, setHoveredDay] = useState<DailyListeningData | null>(null);

  // Group 365 days into 53 weeks (columns) x 7 days (rows)
  const days = analytics.dailyHistory;
  const weeks: DailyListeningData[][] = [];
  let currentWeek: DailyListeningData[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (!day) continue;
    currentWeek.push(day);
    if (currentWeek.length === 7 || i === days.length - 1) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Intensity color mapping adhering strictly to obsidian + crimson accent theme
  const getIntensityClass = (intensity: number) => {
    switch (intensity) {
      case 1:
        return "bg-accent/25 border-accent/30";
      case 2:
        return "bg-accent/50 border-accent/50";
      case 3:
        return "bg-accent/75 border-accent/75";
      case 4:
        return "bg-accent border-accent shadow-[0_0_8px_rgba(224,72,56,0.4)]";
      default:
        return "bg-surface border-border/60 hover:border-border";
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Metric Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Current Streak */}
        <div className="surface-card p-3 sm:p-4 border border-border flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-accent-bg border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <Flame className="w-4 h-4 sm:w-5 sm:h-5 fill-accent/20" />
          </div>
          <div className="min-w-0">
            <div className="text-lg sm:text-xl font-bold font-mono text-text truncate">
              {analytics.currentStreakDays}{" "}
              <span className="text-[10px] sm:text-xs font-normal text-muted">days</span>
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-subtle uppercase tracking-wider truncate">
              Current Streak
            </div>
          </div>
        </div>

        {/* Longest Streak */}
        <div className="surface-card p-3 sm:p-4 border border-border flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-elevated border border-border flex items-center justify-center text-muted shrink-0">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg sm:text-xl font-bold font-mono text-text truncate">
              {analytics.longestStreakDays}{" "}
              <span className="text-[10px] sm:text-xs font-normal text-muted">days</span>
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-subtle uppercase tracking-wider truncate">
              Longest Streak
            </div>
          </div>
        </div>

        {/* Total Time Listened */}
        <div className="surface-card p-3 sm:p-4 border border-border flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-elevated border border-border flex items-center justify-center text-muted shrink-0">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg sm:text-xl font-bold font-mono text-text truncate">
              {formatDuration(analytics.totalListenedSeconds)}
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-subtle uppercase tracking-wider truncate">
              Total Listened
            </div>
          </div>
        </div>

        {/* Books Finished */}
        <div className="surface-card p-3 sm:p-4 border border-border flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-elevated border border-border flex items-center justify-center text-muted shrink-0">
            <BookCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg sm:text-xl font-bold font-mono text-text truncate">
              {analytics.totalBooksCompleted}{" "}
              <span className="text-[10px] sm:text-xs font-normal text-muted">books</span>
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-subtle uppercase tracking-wider truncate">
              Completed
            </div>
          </div>
        </div>
      </div>

      {/* 2. Reading Velocity & Habit Insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="surface-card p-3 sm:p-4 border border-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-accent shrink-0">
            <Zap className="w-4 h-4 text-accent" />
          </div>
          <div>
            <div className="text-sm sm:text-base font-bold font-mono text-text">
              {analytics.weeklyVelocityMinutes
                ? `${(analytics.weeklyVelocityMinutes / 60).toFixed(1)} hrs`
                : "0 hrs"}
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-subtle uppercase tracking-wider">
              Past 7 Days Velocity
            </div>
          </div>
        </div>

        <div className="surface-card p-3 sm:p-4 border border-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-accent shrink-0">
            <Gauge className="w-4 h-4 text-accent" />
          </div>
          <div>
            <div className="text-sm sm:text-base font-bold font-mono text-text">
              {analytics.averagePlaybackRate ? `${analytics.averagePlaybackRate}x` : "1.00x"}
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-subtle uppercase tracking-wider">
              Average Playback Speed
            </div>
          </div>
        </div>

        <div className="surface-card p-3 sm:p-4 border border-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-accent shrink-0">
            <Sun className="w-4 h-4 text-accent" />
          </div>
          <div>
            <div className="text-sm sm:text-base font-bold font-mono text-text">
              {formatPeakHour(analytics.peakListeningHour)}
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-subtle uppercase tracking-wider">
              Peak Listening Hour
            </div>
          </div>
        </div>
      </div>

      {/* 2. GitHub-Style 365-Day Contribution Heatmap */}
      <div className="surface-card p-4 sm:p-6 border border-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent shrink-0" />
            <h3 className="text-xs sm:text-sm font-semibold font-mono text-text uppercase tracking-wider">
              Listening Activity (Past Year)
            </h3>
          </div>
          <div className="text-xs font-mono text-muted">
            Today:{" "}
            <span className="text-accent font-medium">
              {formatDuration(analytics.todayListenedSeconds)}
            </span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex gap-1">
            {weeks.map((week, wIdx) => (
              <div key={`week-${wIdx}-${week[0]?.date}`} className="flex flex-col gap-1">
                {week.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                    aria-label={`${day.date}: ${formatDuration(day.secondsListened)} listened`}
                    className={`w-3 h-3 rounded-[2px] border transition-all cursor-pointer ${getIntensityClass(
                      day.intensity,
                    )}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Heatmap Legend & Tooltip Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-border/50 text-xs font-mono">
          <div className="text-muted min-h-[1.25rem]">
            {hoveredDay ? (
              <span>
                <strong className="text-text">{hoveredDay.date}</strong>:{" "}
                <span className="text-accent">{formatDuration(hoveredDay.secondsListened)}</span>{" "}
                across {hoveredDay.eventsCount}{" "}
                {hoveredDay.eventsCount === 1 ? "session" : "sessions"}
              </span>
            ) : (
              <span className="text-subtle">Hover over any day to see listening history</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-subtle text-[11px]">
            <span>Less</span>
            <div className="w-2.5 h-2.5 rounded-[1px] bg-surface border border-border" />
            <div className="w-2.5 h-2.5 rounded-[1px] bg-accent/25 border border-accent/30" />
            <div className="w-2.5 h-2.5 rounded-[1px] bg-accent/50 border border-accent/50" />
            <div className="w-2.5 h-2.5 rounded-[1px] bg-accent/75 border border-accent/75" />
            <div className="w-2.5 h-2.5 rounded-[1px] bg-accent border border-accent" />
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
