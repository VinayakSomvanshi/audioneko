import { ChevronUp, FastForward, Moon, Pause, Play, Rewind, Zap } from "lucide-react";
import type { ChangeEvent } from "react";
import { useAudio } from "../../context/audio-context";
import { getBookCoverUrl } from "../../lib/covers";
import { FullPlayerModal } from "./FullPlayerModal";
import { formatScrubberTime } from "./WaveformScrubber";

export function MiniPlayer() {
  const {
    currentBook,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    voiceBoost,
    smartSpeed,
    sleepTimerState,
    setIsFullPlayerOpen,
    togglePlay,
    seekTo,
    skipBy,
    setRate,
    toggleVoiceBoost,
    toggleSmartSpeed,
  } = useAudio();

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

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const cycleRate = () => {
    const rates = [1.0, 1.25, 1.5, 1.75, 2.0];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    setRate(rates[nextIdx] ?? 1.0);
  };

  const handleSeekChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextVal = Number.parseFloat(e.target.value);
    seekTo((nextVal / 100) * duration);
  };

  return (
    <>
      <FullPlayerModal />

      <div className="fixed bottom-14 md:bottom-0 left-0 right-0 z-40 border-t border-border bg-surface px-4 py-2.5 transition-all">
        {/* Interactive top progress scrubber bar */}
        <div className="relative group w-full -mt-2.5 mb-2">
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progressPercent || 0}
            onChange={handleSeekChange}
            aria-label="Audio progress scrubber"
            className="w-full h-1 bg-elevated rounded-none appearance-none cursor-pointer accent-accent"
          />
        </div>

        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Book Meta & Dynamic Wave Visualizer (Tap to expand) */}
          <button
            type="button"
            onClick={() => setIsFullPlayerOpen(true)}
            className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer group"
            title="Expand Full Player"
          >
            <div className="w-10 h-10 rounded border border-border bg-surface shrink-0 overflow-hidden flex items-center justify-center relative group-hover:border-accent transition-colors">
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
              <p className="text-[11px] font-mono text-muted truncate">
                {currentBook.author} {currentBook.narrator ? `• ${currentBook.narrator}` : ""}
              </p>
            </div>

            <ChevronUp className="w-4 h-4 text-muted group-hover:text-text shrink-0 hidden sm:block opacity-60 group-hover:opacity-100 transition-opacity" />
          </button>

          {/* Center: Playback Controls */}
          <div className="flex items-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => skipBy(-15)}
              className="p-1.5 text-muted hover:text-text transition-colors cursor-pointer"
              aria-label="Skip back 15 seconds"
              title="Skip back 15s"
            >
              <Rewind className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
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
              onClick={() => skipBy(30)}
              className="p-1.5 text-muted hover:text-text transition-colors cursor-pointer"
              aria-label="Skip forward 30 seconds"
              title="Skip forward 30s"
            >
              <FastForward className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Time Display, Sleep Badge & DSP Toggles */}
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {/* Sleep timer indicator if active */}
            {sleepTimerState.isActive && (
              <button
                type="button"
                onClick={() => setIsFullPlayerOpen(true)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/20 border border-accent/40 text-accent cursor-pointer"
                title="Sleep Timer Active (click to view)"
              >
                <Moon className="w-3 h-3" />
                <span>{formatScrubberTime(sleepTimerState.remainingSeconds)}</span>
              </button>
            )}

            <div className="text-[11px] font-mono text-muted hidden lg:block">
              <span>{formatTime(currentTime)}</span>
              <span className="text-subtle"> / </span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Voice Boost toggle */}
            <button
              type="button"
              onClick={toggleVoiceBoost}
              className={`px-2 py-1 text-[10px] font-mono rounded surface-card transition-colors cursor-pointer flex items-center gap-1 ${
                voiceBoost
                  ? "border-accent text-accent bg-accent-bg font-medium"
                  : "text-subtle hover:text-text"
              }`}
              title="Voice Boost EQ (85Hz cut, 2.2kHz lift, sibilance taming)"
            >
              <span>EQ</span>
            </button>

            {/* Smart Speed toggle */}
            <button
              type="button"
              onClick={toggleSmartSpeed}
              className={`px-2 py-1 text-[10px] font-mono rounded surface-card transition-colors cursor-pointer flex items-center gap-1 ${
                smartSpeed
                  ? "border-accent text-accent bg-accent-bg font-medium"
                  : "text-subtle hover:text-text"
              }`}
              title="Smart Speed (Trim silent pauses dynamically)"
            >
              <Zap className="w-3 h-3" />
              <span className="hidden sm:inline">SMART</span>
            </button>

            {/* Playback speed toggle */}
            <button
              type="button"
              onClick={cycleRate}
              className="px-2 py-1 text-[11px] font-mono surface-card text-muted hover:text-accent hover:border-accent transition-colors cursor-pointer"
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
