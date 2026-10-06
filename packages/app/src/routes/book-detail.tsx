import {
  type Book,
  type Chapter,
  getPlaybackPercent,
  isPlaybackCompleted,
  isPlaybackInProgress,
} from "@audioneko/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Check, ListMusic, Loader2, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DownloadButton } from "../components/storage/DownloadButton";
import { useAudio } from "../context/audio-context";
import { getBookCoverUrl } from "../lib/covers";

export function BookDetailPage() {
  const { id } = useParams({ strict: false });
  const {
    playBook,
    currentBook,
    isPlaying,
    seekTo,
    resume,
    getSavedProgress,
    resetProgress,
    currentTime,
  } = useAudio();
  const [showStartOverModal, setShowStartOverModal] = useState(false);

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showStartOverModal) {
        setShowStartOverModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showStartOverModal]);

  const { data: bookData, isLoading } = useQuery({
    queryKey: ["book", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/books/${id}`);
      if (!res.ok) return null;
      return (await res.json()) as { book: Book; chapters: Chapter[] };
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  const book = bookData?.book ?? null;
  const chapters = bookData?.chapters ?? [];

  const savedProgress = id ? getSavedProgress(id) : null;
  const savedPosition = savedProgress?.position ?? 0;
  const totalDuration = savedProgress?.duration || book?.durationSeconds || 0;

  const isCurrentBookLoaded = currentBook?.id === book?.id;
  const activePosition = isCurrentBookLoaded && currentTime > 0 ? currentTime : savedPosition;
  const isCompleted = isPlaybackCompleted(activePosition, totalDuration);
  const inProgress = isPlaybackInProgress(activePosition, totalDuration);
  const progressPercent = getPlaybackPercent(activePosition, totalDuration);

  // Which chapter does the active position fall in?
  const resumeChapter =
    activePosition > 0 && chapters.length > 0
      ? (chapters.find(
          (c) =>
            activePosition >= (c.startTime ?? 0) && activePosition < (c.endTime ?? totalDuration),
        ) ?? chapters[0])
      : null;

  const hasProgress = inProgress && activePosition > 3;

  const formatSeconds = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${h > 0 ? `${h}:` : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isCurrentlyPlaying = isPlaying && currentBook?.id === book?.id;

  const handleResume = () => {
    if (!book) return;
    if (currentBook?.id === book.id) {
      seekTo(activePosition);
      if (!isPlaying) {
        resume();
      }
    } else {
      playBook(book, activePosition, chapters.length > 0 ? chapters : undefined);
    }
  };

  const handleStartOverClick = () => {
    setShowStartOverModal(true);
  };

  const handleConfirmStartOver = async () => {
    if (!book) return;
    setShowStartOverModal(false);
    await resetProgress(book.id);
    playBook(book, 0, chapters.length > 0 ? chapters : undefined);
  };

  const handlePlayFromStart = () => {
    if (!book) return;
    playBook(book, 0, chapters.length > 0 ? chapters : undefined);
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-32">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-text transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Library</span>
          </Link>
        </div>
        <div className="surface-card p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start border border-border animate-pulse">
          <div className="w-48 h-48 md:w-56 md:h-56 rounded border border-border bg-elevated shrink-0" />
          <div className="flex-1 space-y-4 pt-2">
            <div className="h-4 bg-elevated rounded w-24" />
            <div className="h-8 bg-elevated rounded w-3/4" />
            <div className="h-4 bg-elevated rounded w-1/2" />
            <div className="h-16 bg-elevated rounded w-full" />
          </div>
        </div>
        <div className="flex items-center justify-center py-8 text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2 text-accent" />
          <span className="text-xs font-mono">Loading audiobook...</span>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-32">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-text transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Library</span>
          </Link>
        </div>
        <div className="surface-card p-12 border border-border flex flex-col items-center justify-center gap-4 text-center">
          <BookOpen className="w-12 h-12 text-muted" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-text">Book Not Found</h2>
            <p className="text-xs font-mono text-muted">
              This audiobook could not be found. It may not have been scanned yet.
            </p>
          </div>
          <Link
            to="/"
            className="px-4 py-2 rounded bg-accent text-bg text-xs font-mono font-semibold hover:opacity-90 transition-opacity"
          >
            Return to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
      {/* Back button */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Library</span>
        </Link>
      </div>

      {/* Main Book Card */}
      <div className="surface-card p-4 sm:p-6 md:p-8 flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-start border border-border">
        {/* Cover */}
        <div className="w-44 h-44 sm:w-48 sm:h-48 md:w-56 md:h-56 rounded border border-border bg-surface shrink-0 flex items-center justify-center font-mono text-muted text-xl font-bold shadow-sm overflow-hidden relative mx-auto md:mx-0">
          {book.coverR2Key ? (
            <>
              <img
                src={getBookCoverUrl(book)}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-md opacity-35 scale-110 pointer-events-none select-none"
              />
              <img
                src={getBookCoverUrl(book)}
                alt={book.title}
                className="relative z-10 w-full h-full object-contain select-none drop-shadow-md"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </>
          ) : (
            <span className="text-2xl font-bold text-subtle">{book.format.toUpperCase()}</span>
          )}
        </div>

        {/* Metadata */}
        <div className="flex-1 space-y-4 min-w-0 w-full">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-accent">
              <span className="logo-dot" />
              <span>{book.format.toUpperCase()} AUDIOBOOK</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-text break-words">
              {book.title}
            </h1>
            <p className="text-sm font-mono text-muted">
              By <span className="text-text font-medium">{book.author}</span>
            </p>
            {Boolean(book.series) && (
              <p className="text-xs font-mono text-accent/80">
                {book.series}
                {book.seriesIndex != null && (
                  <span className="text-subtle"> #{book.seriesIndex}</span>
                )}
              </p>
            )}
          </div>

          <p className="text-xs text-muted leading-relaxed line-clamp-4">
            {book.description || `${book.title} by ${book.author}.`}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-subtle pt-2">
            <div>
              <span className="text-muted">Length: </span>
              <span>{formatSeconds(book.durationSeconds)}</span>
            </div>
            {book.fileSizeBytes > 0 && (
              <div>
                <span className="text-muted">Size: </span>
                <span>{(book.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
            )}
            {book.publishedYear && (
              <div>
                <span className="text-muted">Year: </span>
                <span>{book.publishedYear}</span>
              </div>
            )}
            {book.isActiveShelf && (
              <span className="text-accent border border-accent/30 px-2 py-0.5 rounded text-[10px]">
                Active Shelf Cached
              </span>
            )}
          </div>

          {/* ── Progress bar + Resume UI ── */}
          {hasProgress && (
            <div className="space-y-2 pt-1">
              {/* Chapter & time info */}
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-accent">
                  {resumeChapter ? (
                    <>
                      <span className="text-muted">Chapter: </span>
                      <span className="text-text">{resumeChapter.title}</span>
                    </>
                  ) : (
                    <span className="text-muted">In Progress</span>
                  )}
                </span>
                <span className="text-subtle">
                  {formatSeconds(activePosition)}
                  <span className="text-muted/50"> / </span>
                  {formatSeconds(totalDuration)}
                  <span className="text-accent ml-2 font-medium">({progressPercent}%)</span>
                </span>
              </div>

              {/* Chapter-segmented progress bar */}
              <div className="relative w-full h-2 bg-elevated rounded-full overflow-hidden">
                {/* Filled portion */}
                <div
                  className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all"
                  style={{ width: `${Math.min(progressPercent, 100)}%` }}
                />
                {/* Chapter tick marks */}
                {chapters.length > 1 &&
                  totalDuration > 0 &&
                  chapters.slice(1).map((ch) => {
                    const pct = ((ch.startTime ?? 0) / totalDuration) * 100;
                    return (
                      <div
                        key={ch.id}
                        className="absolute inset-y-0 w-px bg-bg/40"
                        style={{ left: `${pct}%` }}
                      />
                    );
                  })}
              </div>

              {/* Chapter dots row */}
              {chapters.length > 1 && chapters.length <= 40 && (
                <div className="flex items-center gap-0.5 overflow-hidden">
                  {chapters.map((ch) => {
                    const isListened = activePosition >= (ch.endTime ?? ch.startTime + 1);
                    const isCurrent = resumeChapter?.id === ch.id;
                    return (
                      <div
                        key={ch.id}
                        title={ch.title}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          isCurrent ? "bg-accent" : isListened ? "bg-accent/50" : "bg-elevated"
                        }`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Completed badge if already finished */}
          {isCompleted && (
            <div className="flex items-center gap-2 text-xs font-mono text-accent pt-1">
              <Check className="w-4 h-4" />
              <span>You have listened to this entire audiobook.</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-2">
            {hasProgress ? (
              <>
                {/* Primary: Resume */}
                <button
                  type="button"
                  onClick={handleResume}
                  className="px-5 sm:px-6 py-2.5 rounded bg-accent text-bg font-mono font-medium text-xs flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{isCurrentlyPlaying ? "NOW PLAYING" : "RESUME"}</span>
                </button>

                {/* Secondary: Start from Beginning with Pop-up Confirmation Warning */}
                <button
                  type="button"
                  onClick={handleStartOverClick}
                  className="px-3.5 sm:px-4 py-2.5 rounded border border-border bg-surface text-muted font-mono text-xs flex items-center gap-2 hover:bg-elevated hover:text-text transition-colors cursor-pointer"
                  title="Start from Beginning (resets progress)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Start Over</span>
                </button>
              </>
            ) : isCompleted ? (
              <>
                {/* Listen again if finished */}
                <button
                  type="button"
                  onClick={handleStartOverClick}
                  className="px-5 sm:px-6 py-2.5 rounded bg-accent text-bg font-mono font-medium text-xs flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>START OVER</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handlePlayFromStart}
                className="px-5 sm:px-6 py-2.5 rounded bg-accent text-bg font-mono font-medium text-xs flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isCurrentlyPlaying ? "NOW PLAYING" : "LISTEN NOW"}</span>
              </button>
            )}

            {/* Offline Download Button */}
            <DownloadButton book={book} />
          </div>
        </div>
      </div>

      {/* Chapters Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2 font-mono text-xs text-text font-medium">
            <ListMusic className="w-4 h-4 text-accent" />
            <span>CHAPTERS ({chapters.length})</span>
          </div>
          <span className="text-[11px] font-mono text-subtle">
            Total: {formatSeconds(book.durationSeconds)}
          </span>
        </div>

        {chapters.length === 0 ? (
          <div className="surface-card p-8 border border-border flex flex-col items-center gap-2 text-center">
            <ListMusic className="w-6 h-6 text-muted" />
            <p className="text-xs font-mono text-muted">
              No chapter markers found. The full audiobook plays as a single track.
            </p>
            <button
              type="button"
              onClick={handlePlayFromStart}
              className="mt-2 px-4 py-2 rounded bg-accent text-bg text-xs font-mono font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Play className="w-3 h-3 inline fill-current mr-1.5" />
              Play Full Audiobook
            </button>
          </div>
        ) : (
          <div className="surface-card divide-y divide-border border border-border">
            {chapters.map((chapter) => {
              const isCurrentChapter =
                isCurrentlyPlaying &&
                savedPosition >= (chapter.startTime ?? 0) &&
                savedPosition < (chapter.endTime ?? book.durationSeconds);
              const isListened = savedPosition >= (chapter.endTime ?? chapter.startTime + 1);

              return (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => {
                    if (currentBook?.id !== book.id) {
                      playBook(book, chapter.startTime, chapters);
                    } else {
                      seekTo(chapter.startTime);
                    }
                  }}
                  className={`w-full p-3 sm:p-3.5 flex items-center justify-between text-left hover:bg-elevated transition-colors cursor-pointer gap-2 ${
                    isCurrentChapter ? "bg-accent/10 border-l-2 border-l-accent" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 pr-2">
                    <span
                      className={`text-xs font-mono w-6 shrink-0 ${isListened ? "text-accent" : "text-subtle"}`}
                    >
                      {chapter.chapterIndex.toString().padStart(2, "0")}
                    </span>
                    <span
                      className={`text-xs font-medium truncate ${isCurrentChapter ? "text-accent" : isListened ? "text-text/70" : "text-text"}`}
                    >
                      {chapter.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono text-subtle shrink-0">
                    {isListened && !isCurrentChapter && (
                      <span className="text-accent/60 text-[10px]">✓</span>
                    )}
                    <span>{formatSeconds(chapter.startTime)}</span>
                    <span className="text-[10px] text-muted hidden xs:inline">
                      ({formatSeconds(chapter.duration)})
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pop-up confirmation warning when clicking Start from Beginning */}
      {showStartOverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          {/* Click outside backdrop button */}
          <button
            type="button"
            className="fixed inset-0 cursor-default bg-transparent border-0 p-0 w-full h-full"
            onClick={() => setShowStartOverModal(false)}
            aria-label="Close confirmation dialog"
            tabIndex={-1}
          />

          <div className="surface-card border border-border p-6 max-w-md w-full shadow-2xl space-y-4 relative z-10">
            <button
              type="button"
              onClick={() => setShowStartOverModal(false)}
              className="absolute top-4 right-4 text-muted hover:text-text transition-colors p-1 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0 mt-0.5">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 flex-1 pr-4">
                <h3 id="start-over-title" className="text-base font-semibold text-text">
                  Reset Listening Progress?
                </h3>
                <p className="text-xs font-mono text-muted leading-relaxed">
                  Starting <span className="text-text font-medium">"{book.title}"</span> from the
                  beginning will reset your saved progress (
                  <span className="text-accent font-semibold">
                    {formatSeconds(activePosition)} · {progressPercent}%
                  </span>
                  ) back to 0:00. This cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShowStartOverModal(false)}
                className="px-4 py-2 rounded border border-border bg-surface text-muted font-mono text-xs hover:bg-elevated hover:text-text transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStartOver}
                className="px-4 py-2 rounded bg-accent text-bg font-mono font-medium text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset & Start Over</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
