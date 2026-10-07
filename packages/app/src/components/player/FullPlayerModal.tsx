import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  ChevronDown,
  FastForward,
  Headphones,
  ListMusic,
  Maximize2,
  Mic,
  Moon,
  Pause,
  Play,
  Plus,
  Rewind,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sliders,
  Trash2,
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

interface BookmarkItem {
  id: string;
  userId: string;
  bookId: string;
  positionSeconds: number;
  chapterTitle?: string | null;
  note?: string | null;
  createdAt: string;
}

export function FullPlayerModal() {
  const {
    currentBook,
    chapters,
    currentChapter,
    isPlaying,
    currentTime,
    duration,
    bufferedTime,
    playbackRate,
    volume,
    isMuted,
    voiceBoost,
    smartSpeed,
    smartRewind,
    equalizerPreset,
    setIsEqualizerOpen,
    setIsHeadsetSettingsOpen,
    isFullPlayerOpen,
    setIsFullPlayerOpen,
    togglePlay,
    seekTo,
    skipBy,
    setRate,
    setVol,
    toggleMute,
    toggleVoiceBoost,
    toggleSmartSpeed,
    toggleSmartRewind,
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

  const queryClient = useQueryClient();
  const [showChapterList, setShowChapterList] = useState(false);
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [newBookmarkNote, setNewBookmarkNote] = useState("");
  const [isAddingBookmark, setIsAddingBookmark] = useState(false);

  const { data: bookmarksData, isLoading: isBookmarksLoading } = useQuery<{
    bookmarks: BookmarkItem[];
  }>({
    queryKey: ["bookmarks", currentBook?.id],
    queryFn: async () => {
      if (!currentBook?.id) return { bookmarks: [] };
      const res = await fetch(`/api/bookmarks/${currentBook.id}`);
      if (!res.ok) throw new Error("Failed to load bookmarks");
      return res.json();
    },
    enabled: !!currentBook?.id && (showBookmarks || isFullPlayerOpen),
  });

  const createBookmarkMutation = useMutation({
    mutationFn: async ({ note }: { note?: string }) => {
      if (!currentBook) return;
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: currentBook.id,
          positionSeconds: currentTime,
          chapterTitle: currentChapter?.title || undefined,
          note: note?.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create bookmark");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks", currentBook?.id] });
      setNewBookmarkNote("");
      setIsAddingBookmark(false);
    },
  });

  const deleteBookmarkMutation = useMutation({
    mutationFn: async (bookmarkId: string) => {
      const res = await fetch(`/api/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete bookmark");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks", currentBook?.id] });
    },
  });

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showChapterList) setShowChapterList(false);
        else if (showSleepModal) setShowSleepModal(false);
        else if (showSpeedMenu) setShowSpeedMenu(false);
        else if (showBookmarks) setShowBookmarks(false);
        else setIsFullPlayerOpen(false);
      }
    };
    if (isFullPlayerOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isFullPlayerOpen,
    showChapterList,
    showSleepModal,
    showSpeedMenu,
    showBookmarks,
    setIsFullPlayerOpen,
  ]);

  if (!isFullPlayerOpen || !currentBook) {
    return null;
  }

  const speedOptions = [0.75, 1.0, 1.2, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
  const sleepPresets: SleepTimerPreset[] = [5, 15, 30, 45, 60, "end-of-chapter"];

  return (
    <div className="fixed inset-0 z-50 bg-bg text-text flex flex-col justify-between overflow-y-auto animate-in fade-in duration-200">
      {/* 1. Header Bar */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] border-b border-border bg-surface shrink-0">
        <button
          type="button"
          onClick={() => setIsFullPlayerOpen(false)}
          className="p-1.5 sm:p-2 -ml-1 sm:-ml-2 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer"
          aria-label="Minimize full player"
          title="Minimize"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <div className="text-center min-w-0 px-2 flex-1">
          <span className="text-[10px] font-mono tracking-widest text-muted uppercase">
            NOW PLAYING
          </span>
          {currentBook.seriesIndex && (
            <p className="text-xs font-mono text-accent truncate">
              Series #{currentBook.seriesIndex}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Bookmarks drawer button */}
          <button
            type="button"
            onClick={() => setShowBookmarks(true)}
            className={`p-1.5 sm:p-2 rounded transition-colors cursor-pointer relative ${
              showBookmarks
                ? "bg-accent/20 text-accent border border-accent/40"
                : "text-muted hover:text-text hover:bg-elevated"
            }`}
            aria-label="Bookmarks"
            title="Bookmarks & Notes"
          >
            <Bookmark className="w-4 h-4" />
            {bookmarksData?.bookmarks && bookmarksData.bookmarks.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent" />
            )}
          </button>

          {/* PiP button */}
          <button
            type="button"
            onClick={togglePiP}
            className={`p-1.5 sm:p-2 rounded transition-colors cursor-pointer ${
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
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded text-xs font-mono transition-colors cursor-pointer ${
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
      <main className="flex-1 max-w-xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] flex flex-col justify-center gap-4 sm:gap-6">
        {/* Large Cover Art with Crisp Border & Obsidian Shadow */}
        <div className="relative aspect-square w-full max-w-[240px] sm:max-w-[300px] md:max-w-[340px] mx-auto rounded-lg border border-border bg-surface overflow-hidden shadow-2xl flex items-center justify-center group">
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
        <div className="text-center space-y-1 px-2">
          <h2 className="text-base sm:text-lg md:text-xl font-bold text-text tracking-tight truncate">
            {currentBook.title}
          </h2>
          <p className="text-xs sm:text-sm font-mono text-muted truncate">{currentBook.author}</p>
          {currentChapter && (
            <button
              type="button"
              onClick={() => setShowChapterList(true)}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-accent hover:underline pt-1 cursor-pointer max-w-full"
            >
              <span className="truncate">{currentChapter.title}</span>
              <span className="text-subtle shrink-0">
                ({currentChapter.chapterIndex + 1}/{chapters.length})
              </span>
            </button>
          )}
        </div>

        {/* High-Precision Decelerated Waveform Scrubber */}
        <div className="w-full">
          <WaveformScrubber
            currentTime={currentTime}
            duration={duration}
            bufferedTime={bufferedTime}
            chapters={chapters}
            onSeek={seekTo}
          />
        </div>

        {/* Primary Playback Transport Bar */}
        <div className="flex items-center justify-center gap-2.5 sm:gap-4 md:gap-6">
          <button
            type="button"
            onClick={previousChapter}
            className="p-2 sm:p-2.5 text-muted hover:text-text transition-colors cursor-pointer"
            aria-label="Previous Chapter"
            title="Previous Chapter"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => skipBy(-15)}
            className="p-2.5 sm:p-3 text-muted hover:text-text transition-colors cursor-pointer relative"
            aria-label="Skip back 15 seconds"
            title="Rewind 15s"
          >
            <Rewind className="w-5 sm:w-6 h-5 sm:h-6" />
            <span className="absolute text-[9px] font-mono font-bold bottom-1 text-muted">15</span>
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-accent text-bg flex items-center justify-center hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-lg"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-6 sm:w-7 h-6 sm:h-7" />
            ) : (
              <Play className="w-6 sm:w-7 h-6 sm:h-7 translate-x-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => skipBy(30)}
            className="p-2.5 sm:p-3 text-muted hover:text-text transition-colors cursor-pointer relative"
            aria-label="Skip forward 30 seconds"
            title="Forward 30s"
          >
            <FastForward className="w-5 sm:w-6 h-5 sm:h-6" />
            <span className="absolute text-[9px] font-mono font-bold bottom-1 text-muted">30</span>
          </button>

          <button
            type="button"
            onClick={nextChapter}
            className="p-2 sm:p-2.5 text-muted hover:text-text transition-colors cursor-pointer"
            aria-label="Next Chapter"
            title="Next Chapter"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Secondary DSP & Playback Tools */}
        <div className="flex flex-wrap items-center justify-between border-t border-border pt-3 sm:pt-4 px-1 sm:px-2 gap-2">
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

          {/* 5-Band Voice Equalizer Button */}
          <button
            type="button"
            onClick={() => setIsEqualizerOpen(true)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
              equalizerPreset !== "flat"
                ? "border-accent bg-accent/15 text-accent font-semibold"
                : "border-border bg-surface text-muted hover:text-text"
            }`}
            title="5-Band Voice Equalizer & Acoustic Presets"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>EQ{equalizerPreset !== "flat" ? ` (${equalizerPreset})` : ""}</span>
          </button>

          {/* Headset & Media Session Controls Button */}
          <button
            type="button"
            onClick={() => setIsHeadsetSettingsOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono border border-border bg-surface text-muted hover:text-text transition-colors cursor-pointer"
            title="Headset & Media Session Hardware Remapping"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Headset</span>
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

          {/* Smart Resume Rewind Toggle */}
          <button
            type="button"
            onClick={toggleSmartRewind}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
              smartRewind
                ? "border-accent bg-accent/15 text-accent font-semibold"
                : "border-border bg-surface text-muted hover:text-text"
            }`}
            title="Smart Resume: Automatically rewinds 5-25s when resuming after interruptions"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Smart Rewind</span>
          </button>

          {/* Volume Control & Mute */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="text-muted hover:text-text p-1 cursor-pointer transition-colors"
              aria-label={isMuted ? "Unmute" : "Mute"}
              title={isMuted ? "Unmute (M)" : "Mute (M)"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-accent" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => setVol(Number.parseFloat(e.target.value))}
              aria-label="Volume slider"
              className="w-14 sm:w-20 h-1 bg-elevated appearance-none cursor-pointer accent-accent"
            />
          </div>
        </div>
      </main>

      {/* 3. Chapter Selection Drawer / Modal */}
      {showChapterList && (
        <div className="fixed inset-0 z-60 bg-bg/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-surface border-l border-border h-full flex flex-col p-4 sm:p-6 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-2xl animate-in slide-in-from-right duration-200">
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

      {/* Bookmarks & Notes Drawer */}
      {showBookmarks && (
        <div className="fixed inset-0 z-60 bg-bg/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-surface border-l border-border h-full flex flex-col p-4 sm:p-6 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-sm tracking-tight text-text">BOOKMARKS & NOTES</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBookmarks(false);
                  setIsAddingBookmark(false);
                }}
                className="p-1 rounded text-muted hover:text-text hover:bg-elevated cursor-pointer"
                aria-label="Close bookmarks drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Add Bookmark Section */}
            <div className="mb-4 p-3 rounded-lg border border-border bg-elevated/40 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted">
                  Position: <strong className="text-text">{formatScrubberTime(currentTime)}</strong>
                </span>
                {!isAddingBookmark && (
                  <button
                    type="button"
                    onClick={() => setIsAddingBookmark(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-bg font-bold text-xs font-mono hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Bookmark</span>
                  </button>
                )}
              </div>

              {isAddingBookmark && (
                <div className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                  <input
                    type="text"
                    value={newBookmarkNote}
                    onChange={(e) => setNewBookmarkNote(e.target.value)}
                    placeholder="Add an optional note..."
                    className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-text placeholder:text-subtle focus:outline-none focus:border-accent"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        createBookmarkMutation.mutate({ note: newBookmarkNote });
                      }
                    }}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingBookmark(false);
                        setNewBookmarkNote("");
                      }}
                      className="px-2.5 py-1 rounded text-xs font-mono text-muted hover:text-text cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={createBookmarkMutation.isPending}
                      onClick={() => createBookmarkMutation.mutate({ note: newBookmarkNote })}
                      className="px-3 py-1 rounded bg-accent text-bg font-bold text-xs font-mono hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {createBookmarkMutation.isPending ? "Saving..." : "Save Bookmark"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bookmarks List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {isBookmarksLoading ? (
                <p className="text-xs font-mono text-muted text-center py-8">
                  Loading bookmarks...
                </p>
              ) : !bookmarksData?.bookmarks || bookmarksData.bookmarks.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-2">
                  <Bookmark className="w-8 h-8 text-subtle mx-auto opacity-40" />
                  <p className="text-xs font-mono text-muted">
                    No bookmarks saved for this book yet.
                  </p>
                  <p className="text-[11px] text-subtle">
                    Tap &quot;Add Bookmark&quot; to save key moments with optional notes.
                  </p>
                </div>
              ) : (
                bookmarksData.bookmarks.map((bm) => (
                  <div
                    key={bm.id}
                    className="group p-3 rounded-lg border border-border bg-surface hover:border-accent/40 transition-colors flex items-start justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        seekTo(bm.positionSeconds);
                        setShowBookmarks(false);
                      }}
                      className="flex-1 text-left cursor-pointer space-y-1 min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-accent/15 text-accent text-xs font-mono font-bold">
                          {formatScrubberTime(bm.positionSeconds)}
                        </span>
                        {bm.chapterTitle && (
                          <span className="text-[11px] font-mono text-muted truncate">
                            {bm.chapterTitle}
                          </span>
                        )}
                      </div>
                      {bm.note && (
                        <p className="text-xs text-text break-words line-clamp-3 pt-0.5 font-sans">
                          {bm.note}
                        </p>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteBookmarkMutation.mutate(bm.id)}
                      className="p-1.5 rounded text-subtle hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-60 group-hover:opacity-100"
                      title="Delete bookmark"
                      aria-label="Delete bookmark"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
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
