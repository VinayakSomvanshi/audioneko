import type { Book, Chapter } from "@audioneko/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, ListMusic, Loader2, Play } from "lucide-react";
import { DownloadButton } from "../components/storage/DownloadButton";
import { useAudio } from "../context/audio-context";
import { getBookCoverUrl } from "../lib/covers";

export function BookDetailPage() {
  const { id } = useParams({ strict: false });
  const { playBook, currentBook, isPlaying, seekTo } = useAudio();

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

  const formatSeconds = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${h > 0 ? `${h}:` : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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

  // Not found / error state
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
      <div className="surface-card p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start border border-border">
        {/* Cover presentation */}
        <div className="w-48 h-48 md:w-56 md:h-56 rounded border border-border bg-surface shrink-0 flex items-center justify-center font-mono text-muted text-xl font-bold shadow-sm overflow-hidden relative">
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

        {/* Metadata Details */}
        <div className="flex-1 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-accent">
              <span className="logo-dot" />
              <span>{book.format.toUpperCase()} AUDIOBOOK</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text">
              {book.title}
            </h1>
            <p className="text-sm font-mono text-muted">
              By <span className="text-text font-medium">{book.author}</span>
              {book.narrator && (
                <span>
                  {" "}
                  • Narrated by <span className="text-text">{book.narrator}</span>
                </span>
              )}
            </p>
            {/* Series badge */}
            {"series" in book && book.series && (
              <p className="text-xs font-mono text-accent/80">
                {String(book.series)}
                {"seriesIndex" in book && book.seriesIndex != null && (
                  <span className="text-subtle"> #{String(book.seriesIndex)}</span>
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

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={() => playBook(book, 0, chapters.length > 0 ? chapters : undefined)}
              className="px-6 py-2.5 rounded bg-accent text-bg font-mono font-medium text-xs flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {isPlaying && currentBook?.id === book.id ? "PAUSE PLAYBACK" : "LISTEN NOW"}
              </span>
            </button>

            {/* Offline OPFS Download Button */}
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
              onClick={() => playBook(book, 0)}
              className="mt-2 px-4 py-2 rounded bg-accent text-bg text-xs font-mono font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Play className="w-3 h-3 inline fill-current mr-1.5" />
              Play Full Audiobook
            </button>
          </div>
        ) : (
          <div className="surface-card divide-y divide-border border border-border">
            {chapters.map((chapter) => {
              const isCurrentPlaying = isPlaying && currentBook?.id === book.id;

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
                  className={`w-full p-3.5 flex items-center justify-between text-left hover:bg-elevated transition-colors cursor-pointer ${
                    isCurrentPlaying ? "bg-accent-bg" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-subtle w-6">
                      {chapter.chapterIndex.toString().padStart(2, "0")}
                    </span>
                    <span className="text-xs font-medium text-text">{chapter.title}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono text-subtle">
                    <span>{formatSeconds(chapter.startTime)}</span>
                    <span className="text-[10px] text-muted">
                      ({formatSeconds(chapter.duration)})
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
