import { ChevronUp, FastForward, Moon, Pause, Play, Rewind, X, Zap } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { useAudio } from "../../context/audio-context";
import { getBookCoverUrl } from "../../lib/covers";
import { triggerHapticFeedback } from "../../lib/haptics";
import type { SleepTimerPreset } from "../../lib/sleep-timer";
import { FullPlayerModal } from "./FullPlayerModal";
import { formatScrubberTime } from "./WaveformScrubber";

export function MiniPlayer() {
  const {
    currentBook,
    isPlaying,
    currentTime,
    duration,
    bufferedTime,
    playbackRate,
    smartSpeed,
    equalizerPreset,
    setIsEqualizerOpen,
    sleepTimerState,
    setIsFullPlayerOpen,
    togglePlay,
    seekTo,
    skipBy,
    setRate,
    toggleSmartSpeed,
    startSleepTimer,
    cancelSleepTimer,
  } = useAudio();

  const [showSleepPopover, setShowSleepPopover] = useState(false);

  if (!currentBook) {
    return null;
  }

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return "0:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime = Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;
  const safeBufferedTime = Number.isFinite(bufferedTime) && bufferedTime >= 0 ? bufferedTime : 0;
  const progressPercent =
    safeDuration > 0 ? Math.min(100, Math.max(0, (safeCurrentTime / safeDuration) * 100)) : 0;
  const bufferedPercent =
    safeDuration > 0 ? Math.min(100, Math.max(0, (safeBufferedTime / safeDuration) * 100)) : 0;

  const cycleRate = () => {
    const rates = [1.0, 1.25, 1.5, 1.75, 2.0];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    setRate(rates[nextIdx] ?? 1.0);
  };

  const handleSeekChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextVal = Number.parseFloat(e.target.value);
    if (Number.isFinite(nextVal) && safeDuration > 0) {
      seekTo(Math.max(0, Math.min(safeDuration, (nextVal / 100) * safeDuration)));
    }
  };

  return (
    <>
      <FullPlayerModal />

      <div className="shrink-0 z-40 border-t border-border bg-surface px-3 sm:px-4 py-2 sm:py-2.5 transition-all">
        {/* Interactive top progress scrubber bar with dual buffered & played visual tracks */}
        <div className="relative group w-full -mt-2 sm:-mt-2.5 mb-1.5 sm:mb-2 h-1 bg-elevated overflow-hidden">
          {/* Buffered track */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-text/30 pointer-events-none transition-all duration-150"
            style={{
              width: `${bufferedPercent}%`,
            }}
          />
          {/* Played track */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-accent pointer-events-none transition-all duration-75"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progressPercent || 0}
            onChange={handleSeekChange}
            aria-label="Audio progress scrubber"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2.5 sm:gap-4">
          {/* Left: Book Meta & Dynamic Wave Visualizer (Tap to expand) */}
          <button
            type="button"
            onClick={() => setIsFullPlayerOpen(true)}
            className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 text-left cursor-pointer group"
            title="Expand Full Player"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded border border-border bg-surface shrink-0 overflow-hidden flex items-center justify-center relative group-hover:border-accent transition-colors">
              {currentBook.coverR2Key ? (
                <>
                  <img
                    src={getBookCoverUrl(currentBook)}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover blur-sm opacity-35 scale-110 pointer-events-none select-none"
                  />
                  <img
                    src={getBookCoverUrl(currentBook)}
                    alt={currentBook.title}
                    className="relative z-10 w-full h-full object-contain select-none"
                  />
                </>
              ) : (
                <div className="w-full h-full bg-elevated flex items-center justify-center text-subtle text-xs font-mono">
                  {currentBook.format.toUpperCase()}
                </div>
              )}
              {isPlaying && (
                <div className="absolute inset-0 bg-bg/60 flex items-center justify-center gap-0.5">
                  <span className="wave-bar" />
                  <span className="wave-bar" />
                  <span className="wave-bar" />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <h4 className="text-xs font-medium text-text truncate group-hover:text-accent transition-colors">
                {currentBook.title}
              </h4>
              <p className="text-[10px] sm:text-[11px] font-mono text-muted truncate">
                {currentBook.author}
              </p>
            </div>

            <ChevronUp className="w-4 h-4 text-muted group-hover:text-text shrink-0 hidden md:block opacity-60 group-hover:opacity-100 transition-opacity" />
          </button>

          {/* Center: Playback Controls */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback(10);
                skipBy(-15);
              }}
              className="p-1 sm:p-1.5 text-muted hover:text-text transition-colors cursor-pointer"
              aria-label="Skip back 15 seconds"
              title="Skip back 15s"
            >
              <Rewind className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback(15);
                togglePlay();
              }}
              className="w-8 h-8 rounded-full bg-accent text-bg font-bold flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 translate-x-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback(10);
                skipBy(30);
              }}
              className="p-1 sm:p-1.5 text-muted hover:text-text transition-colors cursor-pointer"
              aria-label="Skip forward 30 seconds"
              title="Skip forward 30s"
            >
              <FastForward className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Time Display, Sleep Badge & DSP Toggles */}
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 shrink-0">
            {/* One-Tap Sleep Timer Button & Quick Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSleepPopover((prev) => !prev)}
                className={`flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                  sleepTimerState.isActive
                    ? "bg-accent/20 border border-accent/40 text-accent font-semibold"
                    : "surface-card text-muted hover:text-text hover:border-accent"
                }`}
                title="Sleep Timer (One-tap quick presets)"
                aria-label="Sleep Timer"
              >
                <Moon className="w-3 h-3" />
                {sleepTimerState.isActive && (
                  <span className="hidden xs:inline">
                    {formatScrubberTime(sleepTimerState.remainingSeconds)}
                  </span>
                )}
              </button>

              {showSleepPopover && (
                <div className="absolute bottom-9 right-0 bg-surface border border-border rounded-lg shadow-2xl p-2 z-50 min-w-36 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between px-1.5 py-1 border-b border-border/60 text-[10px] font-mono text-muted uppercase tracking-wider">
                    <span>Sleep Timer</span>
                    <button
                      type="button"
                      onClick={() => setShowSleepPopover(false)}
                      className="text-subtle hover:text-text cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  {([15, 30, 45, 60, "end-of-chapter"] as SleepTimerPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        startSleepTimer(preset);
                        setShowSleepPopover(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-elevated text-xs font-mono text-text cursor-pointer transition-colors"
                    >
                      {preset === "end-of-chapter" ? "End of Chapter" : `${preset} minutes`}
                    </button>
                  ))}

                  {sleepTimerState.isActive && (
                    <button
                      type="button"
                      onClick={() => {
                        cancelSleepTimer();
                        setShowSleepPopover(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-destructive/10 text-xs font-mono text-destructive cursor-pointer transition-colors border-t border-border/50 mt-1"
                    >
                      Turn Off Timer
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="text-[11px] font-mono text-muted hidden lg:block">
              <span>{formatTime(currentTime)}</span>
              <span className="text-subtle"> / </span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Voice Equalizer - shown on sm+ */}
            <button
              type="button"
              onClick={() => setIsEqualizerOpen(true)}
              className={`hidden sm:flex px-2 py-1 text-[10px] font-mono rounded surface-card transition-colors cursor-pointer items-center gap-1 ${
                equalizerPreset !== "flat"
                  ? "border-accent text-accent bg-accent-bg font-medium"
                  : "text-subtle hover:text-text"
              }`}
              title="5-Band Voice Equalizer & Acoustic Presets"
            >
              <span>EQ{equalizerPreset !== "flat" ? ` (${equalizerPreset})` : ""}</span>
            </button>

            {/* Smart Speed toggle - shown on md+ */}
            <button
              type="button"
              onClick={toggleSmartSpeed}
              className={`hidden md:flex px-2 py-1 text-[10px] font-mono rounded surface-card transition-colors cursor-pointer items-center gap-1 ${
                smartSpeed
                  ? "border-accent text-accent bg-accent-bg font-medium"
                  : "text-subtle hover:text-text"
              }`}
              title="Smart Speed (Trim silent pauses dynamically)"
            >
              <Zap className="w-3 h-3" />
              <span>SMART</span>
            </button>

            {/* Playback speed toggle */}
            <button
              type="button"
              onClick={cycleRate}
              className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-mono surface-card text-muted hover:text-accent hover:border-accent transition-colors cursor-pointer"
              title="Playback Speed"
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
