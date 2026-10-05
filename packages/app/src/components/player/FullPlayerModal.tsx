import {
  ChevronDown,
  FastForward,
  ListMusic,
  Maximize2,
  Mic,
  Moon,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAudio } from "../../context/audio-context";
import { getBookCoverUrl } from "../../lib/covers";
import type { SleepTimerPreset } from "../../lib/sleep-timer";
import { WaveformScrubber, formatScrubberTime } from "./WaveformScrubber";

export function FullPlayerModal() {
  const {
    currentBook,
    chapters,
    currentChapter,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    voiceBoost,
    smartSpeed,
    isFullPlayerOpen,
    setIsFullPlayerOpen,
    togglePlay,
    seekTo,
    skipBy,
    setRate,
    setVol,
    toggleVoiceBoost,
    toggleSmartSpeed,
    sleepTimerState,
    startSleepTimer,
    extendSleepTimer,
    cancelSleepTimer,
    setShakeToExtend,
    togglePiP,
    isPiPActive,
    nextChapter,
    previousChapter,
  } = useAudio();

  const [showChapterList, setShowChapterList] = useState(false);
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showChapterList) setShowChapterList(false);
        else if (showSleepModal) setShowSleepModal(false);
        else if (showSpeedMenu) setShowSpeedMenu(false);
        else setIsFullPlayerOpen(false);
      }
    };
    if (isFullPlayerOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullPlayerOpen, showChapterList, showSleepModal, showSpeedMenu, setIsFullPlayerOpen]);

  if (!isFullPlayerOpen || !currentBook) {
    return null;
  }

  const speedOptions = [0.75, 1.0, 1.2, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
  const sleepPresets: SleepTimerPreset[] = [5, 15, 30, 45, 60, "end-of-chapter"];

  return (
    <div className="fixed inset-0 z-50 bg-bg text-text flex flex-col justify-between overflow-y-auto animate-in fade-in duration-200">
      {/* 1. Header Bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface shrink-0">
        <button
          type="button"
          onClick={() => setIsFullPlayerOpen(false)}
          className="p-2 -ml-2 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer"
          aria-label="Minimize full player"
          title="Minimize"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <div className="text-center min-w-0 px-2">
          <span className="text-[10px] font-mono tracking-widest text-muted uppercase">
            NOW PLAYING
          </span>
          {currentBook.seriesIndex && (
            <p className="text-xs font-mono text-accent truncate">
              Series #{currentBook.seriesIndex}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* PiP button */}
          <button
            type="button"
            onClick={togglePiP}
            className={`p-2 rounded transition-colors cursor-pointer ${
              isPiPActive
                ? "bg-accent/20 text-accent border border-accent/40"
                : "text-muted hover:text-text hover:bg-elevated"
            }`}
            aria-label="Picture-in-Picture"
            title="Picture-in-Picture"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Sleep timer button */}
          <button
            type="button"
            onClick={() => setShowSleepModal(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono transition-colors cursor-pointer ${
              sleepTimerState.isActive
                ? "bg-accent text-bg font-bold shadow-sm"
                : "text-muted hover:text-text hover:bg-elevated"
            }`}
            aria-label="Sleep timer"
            title="Sleep timer"
          >
            <Moon className="w-4 h-4" />
            {sleepTimerState.isActive && (
              <span>{formatScrubberTime(sleepTimerState.remainingSeconds)}</span>
            )}
          </button>
        </div>
      </header>

      {/* 2. Main Player Body */}
      <main className="flex-1 max-w-xl w-full mx-auto px-6 py-6 flex flex-col justify-center gap-6">
        {/* Large Cover Art with Crisp Border & Obsidian Shadow */}
        <div className="relative aspect-square w-full max-w-[340px] mx-auto rounded-lg border border-border bg-surface overflow-hidden shadow-2xl flex items-center justify-center group">
          {currentBook.coverR2Key ? (
            <>
              <img
                src={getBookCoverUrl(currentBook)}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-md opacity-35 scale-110 pointer-events-none select-none"
              />
              <img
                src={getBookCoverUrl(currentBook)}
                alt={currentBook.title}
                className="relative z-10 w-full h-full object-contain select-none drop-shadow-lg"
              />
            </>
          ) : (
            <div className="w-full h-full bg-elevated flex flex-col items-center justify-center p-6 text-center">
              <span className="text-2xl font-bold font-mono text-muted mb-2">
                {currentBook.format.toUpperCase()}
              </span>
              <p className="text-xs text-subtle font-mono truncate max-w-full">
                {currentBook.title}
              </p>
            </div>
          )}

          {/* Chapter Quick Jump Overlay Button */}
          {chapters.length > 0 && (
            <button
              type="button"
              onClick={() => setShowChapterList(true)}
              className="absolute bottom-3 right-3 bg-surface/90 border border-border text-text hover:text-accent px-3 py-1.5 rounded text-xs font-mono flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>Chapters ({chapters.length})</span>
            </button>
          )}
        </div>

        {/* Title, Author & Chapter Badge */}
        <div className="text-center space-y-1">
          <h2 className="text-lg md:text-xl font-bold text-text tracking-tight truncate">
            {currentBook.title}
          </h2>
          <p className="text-sm font-mono text-muted truncate">{currentBook.author}</p>
          {currentChapter && (
            <button
              type="button"
              onClick={() => setShowChapterList(true)}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-accent hover:underline pt-1 cursor-pointer"
            >
              <span>{currentChapter.title}</span>
              <span className="text-subtle">
                ({currentChapter.chapterIndex + 1} of {chapters.length})
              </span>
            </button>
          )}
        </div>

        {/* High-Precision Decelerated Waveform Scrubber */}
        <div className="w-full">
          <WaveformScrubber
            currentTime={currentTime}
            duration={duration}
            chapters={chapters}
            onSeek={seekTo}
          />
        </div>

        {/* Primary Playback Transport Bar */}
        <div className="flex items-center justify-center gap-4 md:gap-6">
          <button
            type="button"
            onClick={previousChapter}
            className="p-2.5 text-muted hover:text-text transition-colors cursor-pointer"
            aria-label="Previous Chapter"
            title="Previous Chapter"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => skipBy(-15)}
            className="p-3 text-muted hover:text-text transition-colors cursor-pointer relative"
            aria-label="Skip back 15 seconds"
            title="Rewind 15s"
          >
            <Rewind className="w-6 h-6" />
            <span className="absolute text-[9px] font-mono font-bold bottom-1 text-muted">15</span>
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-accent text-bg flex items-center justify-center hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-lg"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7" />
            ) : (
              <Play className="w-7 h-7 translate-x-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => skipBy(30)}
            className="p-3 text-muted hover:text-text transition-colors cursor-pointer relative"
            aria-label="Skip forward 30 seconds"
            title="Forward 30s"
          >
            <FastForward className="w-6 h-6" />
            <span className="absolute text-[9px] font-mono font-bold bottom-1 text-muted">30</span>
          </button>

          <button
            type="button"
            onClick={nextChapter}
            className="p-2.5 text-muted hover:text-text transition-colors cursor-pointer"
            aria-label="Next Chapter"
            title="Next Chapter"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Secondary DSP & Playback Tools */}
        <div className="flex items-center justify-between border-t border-border pt-4 px-2">
          {/* Speed Selector Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="px-2.5 py-1 rounded border border-border bg-surface hover:bg-elevated text-xs font-mono text-muted hover:text-text transition-colors cursor-pointer"
            >
              {playbackRate.toFixed(2)}x
            </button>

            {showSpeedMenu && (
              <div className="absolute bottom-10 left-0 bg-surface border border-border rounded shadow-xl py-1 z-30 min-w-24">
                {speedOptions.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      setRate(rate);
                      setShowSpeedMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono cursor-pointer hover:bg-elevated ${
                      playbackRate === rate ? "text-accent font-bold" : "text-muted"
                    }`}
                  >
                    {rate.toFixed(2)}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Voice Boost EQ Toggle */}
          <button
            type="button"
            onClick={toggleVoiceBoost}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
              voiceBoost
                ? "border-accent bg-accent/15 text-accent font-semibold"
                : "border-border bg-surface text-muted hover:text-text"
            }`}
            title="Voice Boost: 3-band parametric vocal intelligibility EQ"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice Boost</span>
          </button>

          {/* Smart Speed Silence Trimmer Toggle */}
          <button
            type="button"
            onClick={toggleSmartSpeed}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
              smartSpeed
                ? "border-accent bg-accent/15 text-accent font-semibold"
                : "border-border bg-surface text-muted hover:text-text"
            }`}
            title="Smart Speed: Auto-trims silent pauses dynamically"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Smart Speed</span>
          </button>

          {/* Volume Control */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVol(volume === 0 ? 1 : 0)}
              className="text-muted hover:text-text p-1 cursor-pointer"
              aria-label="Mute toggle"
            >
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVol(Number.parseFloat(e.target.value))}
              aria-label="Volume slider"
              className="w-16 h-1 bg-elevated appearance-none cursor-pointer accent-accent"
            />
          </div>
        </div>
      </main>

      {/* 3. Chapter Selection Drawer / Modal */}
      {showChapterList && (
        <div className="fixed inset-0 z-60 bg-bg/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-surface border-l border-border h-full flex flex-col p-6 shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
              <h3 className="font-bold text-sm tracking-tight text-text">CHAPTERS</h3>
              <button
                type="button"
                onClick={() => setShowChapterList(false)}
                className="p-1 rounded text-muted hover:text-text hover:bg-elevated cursor-pointer"
                aria-label="Close chapter list"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
              {chapters.map((ch, idx) => {
                const isActive = currentChapter?.id === ch.id;
                return (
                  <button
                    key={ch.id || `ch-${idx}`}
                    type="button"
                    onClick={() => {
                      seekTo(ch.startTime);
                      setShowChapterList(false);
                    }}
                    className={`w-full text-left p-3 rounded text-xs font-mono transition-colors flex items-center justify-between cursor-pointer ${
                      isActive
                        ? "bg-accent/15 border border-accent/40 text-accent font-bold"
                        : "hover:bg-elevated text-muted hover:text-text"
                    }`}
                  >
                    <span className="truncate pr-2">{ch.title}</span>
                    <span className="shrink-0 text-subtle text-[11px]">
                      {formatScrubberTime(ch.startTime)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Sleep Timer Modal */}
      {showSleepModal && (
        <div className="fixed inset-0 z-60 bg-bg/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-sm tracking-tight text-text">SLEEP TIMER</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSleepModal(false)}
                className="p-1 rounded text-muted hover:text-text hover:bg-elevated cursor-pointer"
                aria-label="Close sleep modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Active countdown display */}
            {sleepTimerState.isActive && (
              <div className="bg-elevated border border-border p-3 rounded text-center space-y-2">
                <p className="text-xs text-muted font-mono">Timer Ending In:</p>
                <p className="text-2xl font-mono font-bold text-accent">
                  {formatScrubberTime(sleepTimerState.remainingSeconds)}
                </p>
                <div className="flex justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => extendSleepTimer(15)}
                    className="px-3 py-1 bg-surface border border-border hover:bg-elevated text-xs font-mono rounded cursor-pointer text-text"
                  >
                    +15 Min
                  </button>
                  <button
                    type="button"
                    onClick={cancelSleepTimer}
                    className="px-3 py-1 bg-surface border border-border hover:bg-elevated text-xs font-mono rounded cursor-pointer text-accent"
                  >
                    Turn Off
                  </button>
                </div>
              </div>
            )}

            {/* Presets List */}
            <div className="grid grid-cols-2 gap-2">
              {sleepPresets.map((preset) => {
                const label = preset === "end-of-chapter" ? "End of Chapter" : `${preset} Minutes`;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      startSleepTimer(preset);
                      setShowSleepModal(false);
                    }}
                    className="p-2.5 rounded border border-border bg-surface hover:bg-elevated text-xs font-mono text-left cursor-pointer transition-colors text-text"
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Shake to Extend Toggle */}
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <div>
                <label
                  htmlFor="shake-toggle"
                  className="text-xs font-medium text-text cursor-pointer block"
                >
                  Shake to Extend
                </label>
                <span className="text-[10px] text-muted font-mono block">
                  Shake phone during final 5m to add 15m
                </span>
              </div>
              <input
                id="shake-toggle"
                type="checkbox"
                checked={sleepTimerState.shakeToExtendEnabled}
                onChange={(e) => setShakeToExtend(e.target.checked)}
                className="accent-accent cursor-pointer w-4 h-4"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
