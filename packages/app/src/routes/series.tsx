import type { Book } from "@audioneko/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, ChevronRight, Clock, Layers, Play, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAudio } from "../context/audio-context";
import { getBookCoverUrl } from "../lib/covers";

interface SeriesItem {
  id: string;
  name: string;
  description: string | null;
  primaryAuthor: string;
  bookCount: number;
  totalDurationSeconds: number;
  books: Book[];
}

export function SeriesPage() {
  const { playBook, currentBook, isPlaying } = useAudio();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const seriesParamFromUrl = useMemo(() => {
    const searchObj = location.search as Record<string, unknown> | undefined;
    if (typeof searchObj?.series === "string" && searchObj.series) {
      return searchObj.series;
    }
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("series");
    }
    return null;
  }, [location.search]);

  const [selectedSeriesName, setSelectedSeriesName] = useState<string | null>(seriesParamFromUrl);

  // Synchronize state and reset scroll position when route location changes
  useEffect(() => {
    setSelectedSeriesName(seriesParamFromUrl);
    const main = document.getElementById("main-scroll-container");
    if (main) {
      main.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [seriesParamFromUrl]);

  // Direct window popstate listener for instant swipe gesture responsiveness
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedSeriesName(params.get("series"));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const { data: seriesData, isLoading: isSeriesLoading } = useQuery({
    queryKey: ["series"],
    queryFn: async () => {
      const res = await fetch("/api/series");
      if (!res.ok) return { series: [] as SeriesItem[] };
      return (await res.json()) as { series: SeriesItem[] };
    },
    staleTime: 30_000,
  });

  // Fallback to /api/books if series endpoint is still syncing or for immediate local grouping
  const { data: booksData } = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const res = await fetch("/api/books");
      if (!res.ok) return { books: [] as Book[] };
      return (await res.json()) as { books: Book[] };
    },
    staleTime: 30_000,
  });

  const allSeries = useMemo(() => {
    if (seriesData?.series && seriesData.series.length > 0) {
      return seriesData.series;
    }

    // Fallback: Compute series directly from books list
    const books = booksData?.books ?? [];
    const map = new Map<string, SeriesItem>();

    for (const b of books) {
      const seriesName = b.series;
      if (!seriesName) continue;

      if (!map.has(seriesName)) {
        map.set(seriesName, {
          id: b.seriesId || seriesName,
          name: seriesName,
          description: null,
          primaryAuthor: b.author || "Unknown Author",
          bookCount: 0,
          totalDurationSeconds: 0,
          books: [],
        });
      }

      const s = map.get(seriesName)!;
      s.books.push(b);
      s.bookCount++;
      s.totalDurationSeconds += b.durationSeconds || 0;
      if (!s.primaryAuthor && b.author) {
        s.primaryAuthor = b.author;
      }
    }

    return Array.from(map.values())
      .map((s) => {
        s.books.sort((a, b) => (a.seriesIndex ?? 9999) - (b.seriesIndex ?? 9999));
        return s;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [seriesData, booksData]);

  const selectSeries = (name: string | null) => {
    setSelectedSeriesName(name);
    const main = document.getElementById("main-scroll-container");
    if (main) {
      main.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    navigate({
      to: "/series",
      search: name ? { series: name } : {},
    });
  };

  const handleBackToAllSeries = () => {
    const main = document.getElementById("main-scroll-container");
    if (main) {
      main.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      selectSeries(null);
    }
  };

  const formatDuration = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Filter series by query
  const filteredSeries = useMemo(() => {
    if (!searchQuery.trim()) return allSeries;
    const q = searchQuery.toLowerCase();
    return allSeries.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.primaryAuthor.toLowerCase().includes(q) ||
        s.books.some((b) => b.title.toLowerCase().includes(q)),
    );
  }, [allSeries, searchQuery]);

  const activeSeries = selectedSeriesName
    ? allSeries.find(
        (s) =>
          s.name.toLowerCase() === selectedSeriesName.toLowerCase() || s.id === selectedSeriesName,
      )
    : null;

  if (isSeriesLoading && allSeries.length === 0) {
    return (
      <div className="surface-card p-12 text-center text-sm font-mono text-muted border border-border">
        Loading series catalog...
      </div>
    );
  }

  // ==========================================
  // DETAIL VIEW: Chronological Series View
  // ==========================================
  if (activeSeries) {
    const firstBook = activeSeries.books[0];
    const isPlayingThisSeries =
      isPlaying && activeSeries.books.some((b) => b.id === currentBook?.id);

    return (
      <div className="space-y-8 pb-32">
        {/* Navigation Breadcrumb */}
        <div>
          <button
            type="button"
            onClick={handleBackToAllSeries}
            className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-text transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Series</span>
          </button>
        </div>

        {/* Series Header Hero */}
        <div className="surface-card p-4 sm:p-6 md:p-8 border border-border relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 sm:gap-6 justify-between">
            <div className="flex items-center gap-3.5 sm:gap-5 min-w-0 w-full md:w-auto flex-1">
              {/* First Book Cover as Series Hero Artwork */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded border border-border bg-surface shrink-0 flex items-center justify-center font-mono text-muted overflow-hidden relative shadow-lg">
                {firstBook?.coverR2Key ? (
                  <>
                    <img
                      src={getBookCoverUrl(firstBook)}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-sm opacity-40 scale-110 pointer-events-none select-none"
                    />
                    <img
                      src={getBookCoverUrl(firstBook)}
                      alt={activeSeries.name}
                      className="relative z-10 w-full h-full object-contain select-none"
                    />
                  </>
                ) : (
                  <BookOpen className="w-8 h-8 text-muted" />
                )}
              </div>

              <div className="space-y-1 sm:space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 text-accent text-[10px] sm:text-[11px] font-mono tracking-wider uppercase">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Series Saga</span>
                </div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-text tracking-tight line-clamp-2 break-words">
                  {activeSeries.name}
                </h1>
                <p className="text-xs font-mono text-muted truncate">
                  Written by{" "}
                  <span className="text-text font-medium">{activeSeries.primaryAuthor}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-0.5 sm:pt-1 text-[11px] sm:text-xs font-mono text-subtle">
                  <span className="text-accent font-medium">
                    {activeSeries.books.length} Audiobooks
                  </span>
                  <span>•</span>
                  <span>{formatDuration(activeSeries.totalDurationSeconds)} Listening Time</span>
                </div>
              </div>
            </div>

            {/* Quick Play Series Button */}
            {firstBook && (
              <button
                type="button"
                onClick={() => playBook(firstBook)}
                className="w-full md:w-auto px-5 py-2.5 rounded bg-accent text-bg font-mono font-medium text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shrink-0 shadow-sm"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isPlayingThisSeries ? "PLAYING SERIES" : "START BOOK 1"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Series Books Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-text tracking-wide font-mono uppercase">
              Books in this Series
            </h2>
            <p className="text-xs font-mono text-muted">
              Complete collection and reading sequence
            </p>
          </div>
          <span className="text-xs font-mono text-subtle">
            {activeSeries.books.length} installments
          </span>
        </div>

        {/* Ordered Book Cards */}
        <div className="space-y-3">
          {activeSeries.books.map((book, idx) => {
            const isCurrent = currentBook?.id === book.id;
            const bookNumber = book.seriesIndex ?? idx + 1;

            return (
              <div
                key={book.id}
                className={`group surface-card p-4 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-accent/40 ${
                  isCurrent ? "border-accent bg-accent-bg/30" : "border-border"
                }`}
              >
                <Link
                  to="/book/$id"
                  params={{ id: book.id }}
                  className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer select-none"
                >
                  {/* Series Index Badge */}
                  <div className="w-9 h-9 rounded-lg bg-elevated border border-border flex items-center justify-center shrink-0 font-mono text-xs font-bold text-accent">
                    #{bookNumber}
                  </div>

                  {/* Book Cover */}
                  <div className="w-14 h-14 rounded border border-border bg-surface shrink-0 flex items-center justify-center overflow-hidden relative">
                    {book.coverR2Key ? (
                      <img
                        src={getBookCoverUrl(book)}
                        alt={book.title}
                        className="w-full h-full object-contain select-none group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <span className="text-[10px] font-mono text-subtle">
                        {book.format.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Book Metadata */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-surface border border-border text-subtle">
                        Book {bookNumber}
                      </span>
                      {book.isActiveShelf && (
                        <span className="text-[9px] font-mono text-accent font-medium">
                          R2 ACTIVE SHELF
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-text group-hover:text-accent transition-colors line-clamp-1">
                      {book.title}
                    </h3>
                    <p className="text-xs font-mono text-muted line-clamp-1">{book.author}</p>
                  </div>
                </Link>

                {/* Duration and Play Action */}
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-13 sm:pl-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/50">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-subtle">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDuration(book.durationSeconds)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      playBook(book);
                    }}
                    className={`px-3 py-1.5 rounded font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isCurrent && isPlaying
                        ? "bg-accent text-bg font-semibold"
                        : "surface-card border border-border text-text hover:border-accent hover:text-accent"
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isCurrent && isPlaying ? "PAUSE" : "PLAY"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ==========================================
  // LIST VIEW: All Available Series Grid
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
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-text truncate">
              Series Catalog
            </h1>
            <p className="text-xs font-mono text-muted mt-0.5 line-clamp-1">
              Explore audiobook sagas, universes, and complete collections
            </p>
          </div>
        </div>

        {/* Filter Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter series or authors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-elevated border border-border rounded pl-8 pr-3 py-1.5 text-xs font-mono text-text placeholder:text-subtle focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Series Grid */}
      {filteredSeries.length === 0 ? (
        <div className="surface-card p-12 border border-border text-center space-y-2">
          <BookOpen className="w-10 h-10 text-muted mx-auto" />
          <h2 className="text-base font-semibold text-text">No series found</h2>
          <p className="text-xs font-mono text-muted">
            {searchQuery
              ? `No series matching "${searchQuery}"`
              : "No books in your library have series metadata yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSeries.map((series) => {
            const firstBook = series.books[0];

            return (
              <button
                type="button"
                key={series.id}
                onClick={() => selectSeries(series.name)}
                className="group surface-card border border-border hover:border-accent/60 transition-all rounded-lg p-5 cursor-pointer flex flex-col justify-between space-y-4 hover:shadow-md text-left w-full"
              >
                <div className="flex items-start gap-4">
                  {/* Layered / Stacked Cover Art for Series */}
                  <div className="relative w-20 h-20 shrink-0">
                    {/* Layer 2 (back card tilt) */}
                    <div className="absolute inset-0 translate-x-1.5 -translate-y-1.5 bg-elevated border border-border/80 rounded opacity-60 pointer-events-none" />
                    {/* Layer 1 (main cover) */}
                    <div className="relative z-10 w-20 h-20 rounded border border-border bg-surface flex items-center justify-center overflow-hidden">
                      {firstBook?.coverR2Key ? (
                        <>
                          <img
                            src={getBookCoverUrl(firstBook)}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 w-full h-full object-cover blur-sm opacity-35 scale-110 pointer-events-none select-none"
                          />
                          <img
                            src={getBookCoverUrl(firstBook)}
                            alt={series.name}
                            className="relative z-10 w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 select-none"
                          />
                        </>
                      ) : (
                        <BookOpen className="w-6 h-6 text-muted" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-accent font-medium">
                      <span>SERIES</span>
                      <span>•</span>
                      <span>{series.books.length} BOOKS</span>
                    </div>
                    <h2 className="text-base font-bold text-text group-hover:text-accent transition-colors line-clamp-1">
                      {series.name}
                    </h2>
                    <p className="text-xs font-mono text-muted line-clamp-1">
                      {series.primaryAuthor}
                    </p>
                    <p className="text-[11px] font-mono text-subtle pt-1">
                      {formatDuration(series.totalDurationSeconds)} total
                    </p>
                  </div>
                </div>

                {/* Series Books Preview & Action */}
                <div className="pt-3 border-t border-border flex items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-center -space-x-2 py-0.5">
                    {series.books.slice(0, 4).map((b) => (
                      <div
                        key={b.id}
                        className="w-7 h-7 rounded border border-border bg-surface shrink-0 overflow-hidden shadow-sm"
                        title={b.title}
                      >
                        {b.coverR2Key ? (
                          <img
                            src={getBookCoverUrl(b)}
                            alt={b.title}
                            className="w-full h-full object-cover select-none"
                          />
                        ) : (
                          <div className="w-full h-full bg-elevated flex items-center justify-center text-[9px] text-subtle font-bold">
                            {b.title.charAt(0)}
                          </div>
                        )}
                      </div>
                    ))}
                    {series.books.length > 4 && (
                      <div className="w-7 h-7 rounded border border-border bg-elevated flex items-center justify-center text-[9px] font-mono text-muted shrink-0 shadow-sm z-10">
                        +{series.books.length - 4}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs font-mono text-accent group-hover:text-accent-hover transition-colors shrink-0">
                    <span>View Series</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
