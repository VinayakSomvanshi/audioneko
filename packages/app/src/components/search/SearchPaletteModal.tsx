import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Clock, Play, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "../../context/audio-context";
import {
  type BookSearchResult,
  type SearchableBook,
  searchBooks,
  updateSearchIndex,
} from "../../lib/search";
import { BlinkingNeko } from "../icons/NekoIcon";

interface SearchPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  books?: SearchableBook[];
}

export function SearchPaletteModal({ isOpen, onClose, books = [] }: SearchPaletteModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { playBook } = useAudio();

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Execute instant client-side search with microsecond duration tracking
  const { results, searchDurationMs } = useMemo(() => {
    const start = performance.now();
    const res = searchBooks(query, null, 25);
    const duration = performance.now() - start;
    return {
      results: res,
      searchDurationMs: Math.round(duration * 100) / 100,
    };
  }, [query]);

  // Sync books prop to search index if provided
  useEffect(() => {
    if (books.length > 0) {
      updateSearchIndex(books);
    }
  }, [books]);

  // Format seconds to compact duration (e.g. 14h 20m)
  const formatDuration = (secs?: number) => {
    if (!secs) return null;
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const handleSelectBook = useCallback(
    (book: BookSearchResult) => {
      onClose();
      navigate({ to: "/book/$id", params: { id: book.id } });
    },
    [onClose, navigate],
  );

  const handlePlayBook = (e: React.MouseEvent, book: BookSearchResult) => {
    e.stopPropagation();
    onClose();
    playBook({
      id: book.id,
      driveFolderId: book.id,
      title: book.title,
      author: book.author,
      narrator: book.narrator ?? undefined,
      durationSeconds: book.durationSeconds || 0,
      format: "m4b",
      fileSizeBytes: 0,
      isActiveShelf: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  };

  // Keyboard navigation inside search palette
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          results.length > 0 ? (prev - 1 + results.length) % results.length : 0,
        );
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelectBook(results[selectedIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose, handleSelectBook]);

  // Scroll active item into view
  useEffect(() => {
    if (resultsContainerRef.current) {
      const activeEl = resultsContainerRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[calc(1.5rem+env(safe-area-inset-top,0px))] md:pt-24 px-3 sm:px-4 bg-black/75">
      {/* Click outside backdrop */}
      <button
        type="button"
        className="fixed inset-0 cursor-default bg-transparent border-0 p-0 w-full h-full"
        onClick={onClose}
        aria-label="Close search palette"
        tabIndex={-1}
      />

      {/* Obsidian Tactile Command Palette */}
      <div className="relative w-full max-w-2xl bg-[#101012] border border-border shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[85vh] z-10 antialiased">
        {/* Top search input bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-border bg-[#141416] gap-3">
          <Search className="w-4 h-4 text-accent shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search audiobooks by title, author, series..."
            className="flex-1 bg-transparent text-sm text-text placeholder:text-subtle focus:outline-none"
          />

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedIndex(0);
              }}
              className="p-1 text-subtle hover:text-text cursor-pointer transition-colors"
              title="Clear input"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="flex items-center gap-1.5 shrink-0 pl-1">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono border border-border rounded bg-elevated text-subtle">
              ESC
            </kbd>
          </div>
        </div>

        {/* Query status header & sub-5ms latency badge */}
        <div className="px-4 py-2 bg-[#121214] border-b border-border flex items-center justify-between text-[11px] font-mono text-subtle">
          <div className="flex items-center gap-2">
            <span>
              {results.length} {results.length === 1 ? "result" : "results"}
            </span>
            {query.trim() && (
              <span className="text-muted truncate max-w-[200px]">for "{query}"</span>
            )}
          </div>

          {searchDurationMs !== null && (
            <div className="flex items-center gap-1.5 text-accent">
              <BlinkingNeko className="w-3 h-3 text-accent" />
              <span>{searchDurationMs}ms</span>
            </div>
          )}
        </div>

        {/* Results List */}
        <div
          ref={resultsContainerRef}
          className="flex-1 overflow-y-auto divide-y divide-border/60 max-h-[55vh] scrollbar-thin"
        >
          {results.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <BookOpen className="w-8 h-8 text-subtle mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted font-medium">No audiobooks found</p>
              <p className="text-xs text-subtle mt-1">
                Try searching by author name or series title
              </p>
            </div>
          ) : (
            results.map((book, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={book.id}
                  onClick={() => handleSelectBook(book)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleSelectBook(book);
                    }
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left p-3.5 flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                    isSelected ? "bg-surface border-l-2 border-l-accent" : "hover:bg-surface/50"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Thumbnail / Book Icon */}
                    <div className="w-11 h-11 rounded border border-border bg-[#18181b] flex items-center justify-center shrink-0 overflow-hidden">
                      {book.coverUrl ? (
                        <img
                          src={book.coverUrl}
                          alt={book.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <BookOpen className="w-5 h-5 text-subtle" />
                      )}
                    </div>

                    {/* Book Information */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-text truncate">{book.title}</span>
                        {book.series && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 border border-border rounded bg-elevated text-accent shrink-0">
                            {book.series}
                            {book.seriesIndex != null ? ` #${book.seriesIndex}` : ""}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-muted truncate mt-0.5">
                        <span>{book.author}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions / Duration */}
                  <div className="flex items-center gap-3 shrink-0">
                    {book.durationSeconds && (
                      <span className="text-[11px] font-mono text-subtle flex items-center gap-1 hidden sm:flex">
                        <Clock className="w-3 h-3" />
                        {formatDuration(book.durationSeconds)}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handlePlayBook(e, book)}
                      className="p-1.5 border border-border rounded bg-[#18181b] hover:border-accent hover:text-accent text-text transition-all cursor-pointer"
                      title="Play audiobook"
                      aria-label="Play audiobook"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-[#141416] border-t border-border flex items-center justify-between text-[11px] font-mono text-subtle">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 text-[9px] border border-border rounded bg-elevated">
                ↑
              </kbd>
              <kbd className="px-1 py-0.5 text-[9px] border border-border rounded bg-elevated">
                ↓
              </kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-[9px] border border-border rounded bg-elevated">
                ↵
              </kbd>
              <span>open</span>
            </span>
          </div>
          <span className="text-muted">audioneko instant search</span>
        </div>
      </div>
    </div>
  );
}
