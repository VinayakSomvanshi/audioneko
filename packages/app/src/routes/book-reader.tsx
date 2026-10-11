import type { Book, Chapter } from "@audioneko/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  FastForward,
  Glasses,
  Loader2,
  Maximize2,
  Mic,
  Pause,
  Play,
  Rewind,
} from "lucide-react";
import { Suspense, lazy, useEffect } from "react";
import { WaveformScrubber } from "../components/player/WaveformScrubber";
import { useAudio } from "../context/audio-context";
import { getBookCoverUrl } from "../lib/covers";

const ReadAlongReader = lazy(() =>
  import("../components/reader/ReadAlongReader").then((m) => ({
    default: m.ReadAlongReader,
  })),
);

export function BookReaderPage() {
  const { id } = useParams({ strict: false });
  const {
    currentBook,
    chapters,
    isPlaying,
    currentTime,
    duration,
    bufferedTime,
    playbackRate,
    voiceBoost,
    playBook,
    togglePlay,
    seekTo,
    skipBy,
    setRate,
    toggleVoiceBoost,
    setIsFullPlayerOpen,
  } = useAudio();

  const { data, isLoading } = useQuery<{ book: Book; chapters: Chapter[] }>({
    queryKey: ["book", id],
    queryFn: async () => {
      const res = await fetch(`/api/books/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load book");
      return res.json();
    },
    enabled: !!id,
  });

  const book = data?.book;
  const bookChapters = data?.chapters || [];

  // If this book isn't loaded in audio engine yet, pre-load it
  useEffect(() => {
    if (book && (!currentBook || currentBook.id !== book.id)) {
      playBook(book, 0, bookChapters);
    }
  }, [book, currentBook, bookChapters, playBook]);

  // Global Keyboard shortcuts for reader
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        skipBy(-15);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        skipBy(15);
      } else if (e.key === "[") {
        e.preventDefault();
        const rates = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
        const nextRate = rates[Math.max(0, rates.indexOf(playbackRate) - 1)] ?? 1.0;
        setRate(nextRate);
      } else if (e.key === "]") {
        e.preventDefault();
        const rates = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
        const nextRate = rates[Math.min(rates.length - 1, rates.indexOf(playbackRate) + 1)] ?? 1.5;
        setRate(nextRate);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, skipBy, playbackRate, setRate]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <span className="text-xs font-mono text-muted">Loading book and reader...</span>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center space-y-4">
        <BookOpen className="w-10 h-10 text-muted mx-auto" />
        <h2 className="text-base font-semibold text-text">Book Not Found</h2>
        <Link
          to="/"
          className="inline-block px-4 py-2 rounded bg-accent text-bg text-xs font-mono font-bold"
        >
          Return to Library
        </Link>
      </div>
    );
  }

  if (!book.ebookDriveFileId) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center space-y-4 surface-card border border-border rounded-xl">
        <BookOpen className="w-10 h-10 text-muted mx-auto" />
        <h2 className="text-base font-semibold text-text">No Companion E-Book Available</h2>
        <p className="text-xs font-mono text-muted">
          This title does not currently have an EPUB linked. You can still listen to the audiobook.
        </p>
        <Link
          to="/book/$id"
          params={{ id: book.id }}
          className="inline-block px-4 py-2 rounded bg-surface border border-border text-text hover:border-accent text-xs font-mono"
        >
          Go to Audiobook
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-bg text-text flex flex-col justify-between overflow-hidden">
      {/* 1. Header Navigation Bar */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-border bg-surface shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/book/$id"
            params={{ id: book.id }}
            className="p-1.5 -ml-1 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer"
            title="Back to Book Details"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="w-7 h-7 rounded border border-border bg-elevated overflow-hidden shrink-0 hidden sm:block">
            <img
              src={getBookCoverUrl(book)}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-xs font-bold text-text truncate max-w-xs sm:max-w-md">
              {book.title}
            </h1>
            <p className="text-[10px] font-mono text-muted truncate">{book.author}</p>
          </div>
        </div>

        {/* Right Status */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-elevated text-subtle font-mono text-[10px] border border-border">
            <Glasses className="w-3 h-3 text-accent" />
            <span>Immersion Reading</span>
          </span>

          <button
            type="button"
            onClick={() => setIsFullPlayerOpen(true)}
            className="p-1.5 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer"
            title="Expand Full Audio Player"
            aria-label="Expand player"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main Reader Viewport */}
      <main className="flex-1 overflow-hidden relative">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          }
        >
          <ReadAlongReader book={book} isStandalone={true} className="h-full" />
        </Suspense>
      </main>

      {/* 3. Bottom Docked Audio Transport Bar */}
      <footer className="border-t border-border bg-surface px-4 sm:px-6 py-2.5 shrink-0 z-20 space-y-2 shadow-2xl">
        {/* Scrubber timeline */}
        <div className="max-w-2xl mx-auto w-full">
          <WaveformScrubber
            currentTime={currentTime}
            duration={duration}
            bufferedTime={bufferedTime}
            chapters={chapters}
            onSeek={seekTo}
          />
        </div>

        {/* Controls row */}
        <div className="max-w-2xl mx-auto flex items-center justify-between text-xs font-mono">
          {/* Left: Speed & Voice boost */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const rates = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
                const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length] ?? 1.0;
                setRate(next);
              }}
              className="px-2 py-1 rounded border border-border bg-elevated hover:bg-surface text-muted hover:text-text cursor-pointer transition-colors"
              title="Change audio playback speed"
            >
              {playbackRate}x
            </button>

            <button
              type="button"
              onClick={toggleVoiceBoost}
              className={`p-1.5 rounded border transition-colors cursor-pointer ${
                voiceBoost
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-elevated text-muted hover:text-text"
              }`}
              title="Voice Boost EQ (speech clarity)"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Center: Transport buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => skipBy(-15)}
              className="p-1.5 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer"
              title="Rewind 15s"
            >
              <Rewind className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="p-2.5 rounded-full bg-accent text-bg hover:opacity-90 transition-opacity cursor-pointer shadow-md"
              title={isPlaying ? "Pause audio" : "Play audio"}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => skipBy(15)}
              className="p-1.5 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer"
              title="Fast Forward 15s"
            >
              <FastForward className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Keyboard Shortcut Hint */}
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-subtle">
            <kbd className="px-1 py-0.5 rounded bg-elevated border border-border">Space</kbd>
            <span>Play/Pause</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
