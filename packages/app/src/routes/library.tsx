import type { Book } from "@audioneko/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useAudio } from "../context/audio-context";
import { getBookCoverUrl } from "../lib/covers";
import { updateSearchIndex } from "../lib/search";

export function LibraryPage() {
  const { playBook, currentBook, isPlaying } = useAudio();
  const [activeFilter, setActiveFilter] = useState<"all" | "in-progress" | "downloaded">("all");

  const { data: booksData, isLoading } = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const res = await fetch("/api/books");
      if (!res.ok) return { books: [] as Book[] };
      return (await res.json()) as { books: Book[] };
    },
    staleTime: 30_000,
  });

  const booksList = booksData?.books ?? [];

  // Sync client-side search index
  useEffect(() => {
    if (booksList.length > 0) {
      updateSearchIndex(booksList);
    }
  }, [booksList]);

  const formatDuration = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const continueBook = currentBook || (booksList.length > 0 ? booksList[0] : null);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-8 pb-24">
        <div className="surface-card p-5 border border-border animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded bg-elevated shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-3 bg-elevated rounded w-24" />
              <div className="h-6 bg-elevated rounded w-1/2" />
              <div className="h-3 bg-elevated rounded w-1/3" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center py-12 text-muted gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
          <span className="text-xs font-mono">Loading library...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      {/* Hero: Continue Listening */}
      {continueBook && (
        <section className="surface-card p-5 md:p-6 relative overflow-hidden border border-border">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded border border-border bg-surface shrink-0 flex items-center justify-center font-mono text-muted text-lg font-bold overflow-hidden relative">
                {continueBook.coverR2Key ? (
                  <>
                    <img
                      src={getBookCoverUrl(continueBook)}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-sm opacity-35 scale-110 pointer-events-none select-none"
                    />
                    <img
                      src={getBookCoverUrl(continueBook)}
                      alt={continueBook.title}
                      className="relative z-10 w-full h-full object-contain select-none"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  </>
                ) : (
                  continueBook.format.toUpperCase()
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-accent text-xs font-mono">
                  <span className="logo-dot" />
                  <span>CONTINUE LISTENING</span>
                </div>
                <h2 className="text-xl md:text-2xl font-semibold text-text tracking-tight">
                  {continueBook.title}
                </h2>
                <p className="text-xs font-mono text-muted">
                  {continueBook.author} • Narrated by {continueBook.narrator || "Narrator"}
                </p>
                <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-subtle">
                  <span>{formatDuration(continueBook.durationSeconds)}</span>
                  <span>•</span>
                  <span className="text-accent">{continueBook.format.toUpperCase()} STREAM</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => playBook(continueBook)}
              className="w-full md:w-auto px-5 py-2.5 rounded bg-accent text-bg font-mono font-medium text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shrink-0 shadow-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {isPlaying && currentBook?.id === continueBook.id ? "PAUSE" : "RESUME PLAYBACK"}
              </span>
            </button>
          </div>
        </section>
      )}

      {/* Filter Tabs & Count */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-1">
          {(["all", "in-progress", "downloaded"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveFilter(tab)}
              className={`px-3 py-1.5 text-xs font-mono rounded capitalize transition-colors cursor-pointer ${
                activeFilter === tab
                  ? "bg-accent-bg text-accent font-medium border border-accent/20"
                  : "text-muted hover:text-text"
              }`}
            >
              {tab.replace("-", " ")}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono text-subtle">
          <span>{booksList.length} titles</span>
        </div>
      </div>

      {/* Book Grid or Empty State */}
      {booksList.length === 0 ? (
        <div className="surface-card p-12 border border-border flex flex-col items-center justify-center gap-4 text-center">
          <BookOpen className="w-12 h-12 text-muted" />
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-text">Library is empty</h2>
            <p className="text-xs font-mono text-muted max-w-sm">
              No audiobooks have been scanned yet. Ask your admin to trigger a library scan from
              the Google Drive folder.
            </p>
          </div>
          <div className="text-[11px] font-mono text-subtle border border-border rounded px-3 py-2 bg-elevated">
            Admin: POST /api/library/scan to index audiobooks
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {booksList.map((book) => (
            <div
              key={book.id}
              className="group surface-card overflow-hidden flex flex-col transition-all hover:border-text-subtle"
            >
              <div className="aspect-square bg-surface relative flex items-center justify-center border-b border-border overflow-hidden">
                {book.coverR2Key ? (
                  <>
                    <img
                      src={getBookCoverUrl(book)}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-sm opacity-35 scale-110 pointer-events-none select-none"
                    />
                    <img
                      src={getBookCoverUrl(book)}
                      alt={book.title}
                      className="relative z-10 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-sm select-none"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </>
                ) : (
                  <span className="font-mono text-sm font-semibold text-subtle">
                    {book.format.toUpperCase()}
                  </span>
                )}

                {/* Hover quick play button */}
                <button
                  type="button"
                  onClick={() => playBook(book)}
                  className="absolute inset-0 bg-bg/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                  aria-label={`Play ${book.title}`}
                >
                  <div className="w-10 h-10 rounded-full bg-accent text-bg flex items-center justify-center shadow-md">
                    <Play className="w-5 h-5 translate-x-0.5 fill-current" />
                  </div>
                </button>

                <span className="absolute top-2 right-2 text-[9px] font-mono px-1.5 py-0.5 rounded bg-bg/90 border border-border text-subtle">
                  {formatDuration(book.durationSeconds)}
                </span>
              </div>

              <div className="p-3 flex-1 flex flex-col justify-between">
                <div>
                  <Link
                    to="/book/$id"
                    params={{ id: book.id }}
                    className="text-xs font-semibold text-text line-clamp-1 hover:text-accent transition-colors"
                  >
                    {book.title}
                  </Link>
                  <p className="text-[11px] font-mono text-muted line-clamp-1 mt-0.5">
                    {book.author}
                  </p>
                </div>

                <div className="pt-3 flex items-center justify-between text-[10px] font-mono text-subtle border-t border-border mt-3">
                  <span>{book.publishedYear || (book.format ? book.format.toUpperCase() : "—")}</span>
                  {book.isActiveShelf && (
                    <span className="text-accent text-[9px] font-medium">SHELF</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
