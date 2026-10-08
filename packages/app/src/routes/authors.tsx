import type { Book } from "@audioneko/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, ChevronRight, Play, Search, User, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BlinkingNeko } from "../components/icons/NekoIcon";
import { useAudio } from "../context/audio-context";
import { getAuthorPhotoUrl } from "../lib/author-photos";
import { getBookCoverUrl } from "../lib/covers";

function AuthorAvatar({
  name,
  photoUrl,
  className = "w-14 h-14",
  textSize = "text-base",
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
  textSize?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const resolvedPhoto = photoUrl || getAuthorPhotoUrl(name);

  return (
    <div
      className={`${className} rounded-full bg-surface border border-border group-hover:border-accent flex items-center justify-center text-accent font-bold font-mono ${textSize} shrink-0 overflow-hidden relative transition-colors shadow-inner`}
    >
      {resolvedPhoto && !imgError ? (
        <img
          src={resolvedPhoto}
          alt={name}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <span>{name.charAt(0)}</span>
      )}
    </div>
  );
}

interface AuthorItem {
  name: string;
  bookCount: number;
  seriesCount: number;
  seriesNames: string[];
  totalDurationSeconds: number;
  books: Book[];
  photoUrl?: string | null;
  bio?: string | null;
  birthDate?: string | null;
  topWork?: string | null;
  openLibraryKey?: string | null;
}

export function AuthorsPage() {
  const { playBook, currentBook, isPlaying } = useAudio();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const authorParamFromUrl = useMemo(() => {
    const searchObj = location.search as Record<string, unknown> | undefined;
    if (typeof searchObj?.author === "string" && searchObj.author) {
      return searchObj.author;
    }
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("author");
    }
    return null;
  }, [location.search]);

  const [selectedAuthorName, setSelectedAuthorName] = useState<string | null>(authorParamFromUrl);

  // Synchronize state when route location changes
  useEffect(() => {
    setSelectedAuthorName(authorParamFromUrl);
  }, [authorParamFromUrl]);

  // Direct window popstate listener for instant swipe gesture responsiveness
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedAuthorName(params.get("author"));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const { data: authorsData, isLoading: isAuthorsLoading } = useQuery({
    queryKey: ["authors"],
    queryFn: async () => {
      const res = await fetch("/api/authors");
      if (!res.ok) return { authors: [] as AuthorItem[] };
      return (await res.json()) as { authors: AuthorItem[] };
    },
    staleTime: 30_000,
  });

  // Fallback to /api/books if authors endpoint is syncing or for fast local caching
  const { data: booksData } = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const res = await fetch("/api/books");
      if (!res.ok) return { books: [] as Book[] };
      return (await res.json()) as { books: Book[] };
    },
    staleTime: 30_000,
  });

  const allAuthors = useMemo(() => {
    if (authorsData?.authors && authorsData.authors.length > 0) {
      return authorsData.authors;
    }

    const books = booksData?.books ?? [];
    const map = new Map<string, AuthorItem>();

    for (const b of books) {
      const authorName = b.author?.trim() || "Unknown Author";
      if (!map.has(authorName)) {
        map.set(authorName, {
          name: authorName,
          bookCount: 0,
          seriesCount: 0,
          seriesNames: [],
          totalDurationSeconds: 0,
          books: [],
        });
      }

      const a = map.get(authorName)!;
      a.books.push(b);
      a.bookCount++;
      a.totalDurationSeconds += b.durationSeconds || 0;
      if (b.series && !a.seriesNames.includes(b.series)) {
        a.seriesNames.push(b.series);
      }
    }

    return Array.from(map.values())
      .map((a) => {
        a.seriesCount = a.seriesNames.length;
        a.books.sort((x, y) => {
          if (x.series && y.series && x.series === y.series) {
            return (x.seriesIndex ?? 9999) - (y.seriesIndex ?? 9999);
          }
          if (x.series && !y.series) return -1;
          if (!x.series && y.series) return 1;
          return x.title.localeCompare(y.title);
        });
        return a;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [authorsData, booksData]);

  const selectAuthor = (name: string | null) => {
    setSelectedAuthorName(name);
    navigate({
      to: "/authors",
      search: name ? { author: name } : {},
    });
  };

  const handleBackToAllAuthors = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      selectAuthor(null);
    }
  };

  const formatDuration = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const filteredAuthors = useMemo(() => {
    if (!searchQuery.trim()) return allAuthors;
    const q = searchQuery.toLowerCase();
    return allAuthors.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.seriesNames.some((s) => s.toLowerCase().includes(q)) ||
        a.books.some((b) => b.title.toLowerCase().includes(q)),
    );
  }, [allAuthors, searchQuery]);

  const activeAuthor = selectedAuthorName
    ? allAuthors.find((a) => a.name.toLowerCase() === selectedAuthorName.toLowerCase())
    : null;

  if (isAuthorsLoading && allAuthors.length === 0) {
    return (
      <div className="surface-card p-12 text-center text-sm font-mono text-muted border border-border">
        Loading authors catalog...
      </div>
    );
  }

  // ==========================================
  // DETAIL VIEW: Author Audiobooks & Series
  // ==========================================
  if (activeAuthor) {
    // Group author books by series or standalone
    const seriesGroups = new Map<string, Book[]>();
    const standalones: Book[] = [];

    for (const b of activeAuthor.books) {
      if (b.series) {
        if (!seriesGroups.has(b.series)) seriesGroups.set(b.series, []);
        seriesGroups.get(b.series)!.push(b);
      } else {
        standalones.push(b);
      }
    }

    return (
      <div className="space-y-8 pb-32">
        {/* Navigation Breadcrumb */}
        <div>
          <button
            type="button"
            onClick={handleBackToAllAuthors}
            className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-text transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Authors</span>
          </button>
        </div>

        {/* Author Header Banner */}
        <div className="surface-card p-4 sm:p-6 md:p-8 border border-border flex flex-col gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <AuthorAvatar
              name={activeAuthor.name}
              photoUrl={activeAuthor.photoUrl}
              className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20"
              textSize="text-lg sm:text-xl"
            />
            <div className="space-y-1 min-w-0 flex-1">
              <div className="text-[10px] sm:text-[11px] font-mono text-accent uppercase tracking-wider">
                Author Catalog
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-text tracking-tight break-words">
                {activeAuthor.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-0.5 sm:pt-1 text-xs font-mono text-subtle">
                <span className="text-accent font-medium">
                  {activeAuthor.books.length} Audiobooks
                </span>
                {activeAuthor.seriesCount > 0 && (
                  <>
                    <span>•</span>
                    <span>{activeAuthor.seriesCount} Series</span>
                  </>
                )}
                <span>•</span>
                <span>{formatDuration(activeAuthor.totalDurationSeconds)} Listening Time</span>
                {Boolean(activeAuthor.birthDate) && (
                  <>
                    <span>•</span>
                    <span>Born {activeAuthor.birthDate}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {Boolean(activeAuthor.bio) && (
            <div className="pt-3 border-t border-border/60">
              <p className="text-xs sm:text-sm text-muted font-sans leading-relaxed line-clamp-3">
                {activeAuthor.bio}
              </p>
            </div>
          )}
        </div>

        {/* Series Sections */}
        {Array.from(seriesGroups.entries()).map(([seriesName, sBooks]) => {
          sBooks.sort((a, b) => (a.seriesIndex ?? 9999) - (b.seriesIndex ?? 9999));

          return (
            <div key={seriesName} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-2 gap-1.5">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <BlinkingNeko className="w-3.5 h-3.5 text-accent" />
                  <h2 className="text-sm font-bold text-text font-mono uppercase tracking-wide">
                    {seriesName} Series
                  </h2>
                  <span className="text-xs font-mono text-subtle">
                    ({sBooks.length} books in chronological order)
                  </span>
                </div>
                <Link
                  to="/series"
                  search={{ series: seriesName }}
                  className="text-xs font-mono text-accent hover:underline flex items-center gap-1"
                >
                  <span>Series view</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {sBooks.map((book) => (
                  <AuthorBookCard
                    key={book.id}
                    book={book}
                    currentBookId={currentBook?.id}
                    isPlaying={isPlaying}
                    onPlay={playBook}
                    formatDuration={formatDuration}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Standalone Audiobooks Section */}
        {standalones.length > 0 && (
          <div className="space-y-4">
            <div className="border-b border-border pb-2">
              <h2 className="text-sm font-bold text-text font-mono uppercase tracking-wide">
                Standalone Audiobooks
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {standalones.map((book) => (
                <AuthorBookCard
                  key={book.id}
                  book={book}
                  currentBookId={currentBook?.id}
                  isPlaying={isPlaying}
                  onPlay={playBook}
                  formatDuration={formatDuration}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // LIST VIEW: All Authors Grid
  // ==========================================
  return (
    <div className="space-y-8 pb-32">
      {/* Back to Library */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Library</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="surface-card p-4 sm:p-6 md:p-8 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-accent-bg border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-text truncate">
              Authors Catalog
            </h1>
            <p className="text-xs font-mono text-muted mt-0.5 line-clamp-1">
              Discover audiobooks by your favorite authors and series
            </p>
          </div>
        </div>

        {/* Search / Filter Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter authors or books..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-elevated border border-border rounded pl-8 pr-3 py-1.5 text-xs font-mono text-text placeholder:text-subtle focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Authors Grid */}
      {filteredAuthors.length === 0 ? (
        <div className="surface-card p-12 border border-border text-center space-y-2">
          <User className="w-10 h-10 text-muted mx-auto" />
          <h2 className="text-base font-semibold text-text">No authors found</h2>
          <p className="text-xs font-mono text-muted">
            {searchQuery ? `No author matching "${searchQuery}"` : "No books in library."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAuthors.map((author) => {
            const sampleCovers = author.books.filter((b) => b.coverR2Key).slice(0, 3);

            return (
              <button
                type="button"
                key={author.name}
                onClick={() => selectAuthor(author.name)}
                className="group surface-card border border-border hover:border-accent/60 transition-all rounded-lg p-5 cursor-pointer flex flex-col justify-between space-y-4 hover:shadow-md text-left w-full"
              >
                <div className="flex items-start gap-4">
                  {/* Avatar / Portrait */}
                  <AuthorAvatar name={author.name} photoUrl={author.photoUrl} />

                  <div className="space-y-1 flex-1 min-w-0">
                    <h2 className="text-base font-bold text-text group-hover:text-accent transition-colors line-clamp-1">
                      {author.name}
                    </h2>
                    <div className="flex items-center gap-2 text-xs font-mono text-subtle">
                      <span className="text-accent font-medium">
                        {author.books.length} Audiobooks
                      </span>
                      {author.seriesCount > 0 && (
                        <>
                          <span>•</span>
                          <span>{author.seriesCount} Series</span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-muted pt-0.5">
                      {formatDuration(author.totalDurationSeconds)} listening time
                    </p>
                  </div>
                </div>

                {/* Cover previews */}
                {sampleCovers.length > 0 && (
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    {sampleCovers.map((b) => (
                      <div
                        key={b.id}
                        className="w-10 h-10 rounded border border-border bg-surface overflow-hidden shrink-0"
                      >
                        <img
                          src={getBookCoverUrl(b)}
                          alt={b.title}
                          className="w-full h-full object-contain select-none"
                        />
                      </div>
                    ))}
                    {author.books.length > sampleCovers.length && (
                      <span className="text-[10px] font-mono text-subtle pl-1">
                        +{author.books.length - sampleCovers.length} more
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs font-mono text-accent pt-1">
                  <span>View author catalog</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Subcomponent: Book Card for Author View
function AuthorBookCard({
  book,
  currentBookId,
  isPlaying,
  onPlay,
  formatDuration,
}: {
  book: Book;
  currentBookId?: string;
  isPlaying: boolean;
  onPlay: (book: Book) => void;
  formatDuration: (secs: number) => string;
}) {
  const isCurrent = currentBookId === book.id;

  return (
    <Link
      to="/book/$id"
      params={{ id: book.id }}
      className="group surface-card overflow-hidden flex flex-col border border-border hover:border-text-subtle transition-all cursor-pointer block select-none"
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
              className="relative z-10 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105 select-none"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </>
        ) : (
          <BookOpen className="w-8 h-8 text-muted" />
        )}

        {/* Hover Quick Play */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPlay(book);
          }}
          className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-accent text-bg flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all z-20 hover:scale-110 cursor-pointer"
          aria-label={`Play ${book.title}`}
        >
          <Play className="w-4 h-4 translate-x-0.5 fill-current" />
        </button>

        {book.seriesIndex && (
          <span className="absolute top-2 left-2 text-[9px] font-mono px-1.5 py-0.5 rounded bg-bg/90 border border-border text-accent font-bold z-10">
            #{book.seriesIndex}
          </span>
        )}

        <span className="absolute top-2 right-2 text-[9px] font-mono px-1.5 py-0.5 rounded bg-bg/90 border border-border text-subtle z-10">
          {formatDuration(book.durationSeconds)}
        </span>
      </div>

      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-xs font-semibold text-text line-clamp-1 group-hover:text-accent transition-colors">
            {book.title}
          </h3>
        </div>

        <div className="pt-2 flex items-center justify-between text-[10px] font-mono text-subtle border-t border-border mt-2">
          <span>{book.publishedYear || book.format.toUpperCase()}</span>
          {isCurrent && isPlaying && <span className="text-accent font-medium">PLAYING</span>}
        </div>
      </div>
    </Link>
  );
}
