/**
 * audioneko: Notebook & Annotations Timeline
 * Consolidated view of all bookmarks, notes, and highlights across the user's library.
 * Features search, direct jump-to-play, note editing, quote card generation, and Markdown export.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  Download,
  Edit2,
  FileText,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { QuoteCardModal } from "../components/content/QuoteCardModal";
import { getBookCoverUrl } from "../lib/covers";

interface LibraryBookmark {
  id: string;
  bookId: string;
  positionSeconds: number;
  chapterTitle?: string | null;
  note?: string | null;
  createdAt: number;
  bookTitle?: string | null;
  bookAuthor?: string | null;
  coverR2Key?: string | null;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BookmarksPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [quoteCardTarget, setQuoteCardTarget] = useState<LibraryBookmark | null>(null);

  // 1. Fetch all library bookmarks
  const { data, isLoading } = useQuery<{ bookmarks: LibraryBookmark[] }>({
    queryKey: ["allBookmarks"],
    queryFn: async () => {
      const res = await fetch("/api/bookmarks");
      if (!res.ok) return { bookmarks: [] };
      return (await res.json()) as { bookmarks: LibraryBookmark[] };
    },
    staleTime: 15_000,
  });

  // 2. Mutations
  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await fetch(`/api/bookmarks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error("Failed to update bookmark note");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allBookmarks"] });
      setEditingId(null);
    },
  });

  const deleteBookmarkMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete bookmark");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allBookmarks"] });
    },
  });

  const bookmarks = data?.bookmarks ?? [];

  // Filter bookmarks
  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarks;
    const q = searchQuery.toLowerCase();
    return bookmarks.filter(
      (b) =>
        b.bookTitle?.toLowerCase().includes(q) ||
        b.bookAuthor?.toLowerCase().includes(q) ||
        b.chapterTitle?.toLowerCase().includes(q) ||
        b.note?.toLowerCase().includes(q),
    );
  }, [bookmarks, searchQuery]);

  const handleStartEdit = (b: LibraryBookmark) => {
    setEditingId(b.id);
    setEditNote(b.note || "");
  };

  const handleSaveEdit = (id: string) => {
    updateNoteMutation.mutate({ id, note: editNote });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-32">
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

      {/* Header Banner */}
      <div className="surface-card p-4 sm:p-6 md:p-8 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-accent-bg border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-mono text-accent uppercase tracking-wider">
              Annotations & Highlights
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-text break-words">
              Notebook Timeline
            </h1>
            <p className="text-xs font-mono text-muted mt-0.5">
              {bookmarks.length} saved highlights, audio timestamps, and quotes across your library
            </p>
          </div>
        </div>

        {/* Export Action */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/api/bookmarks/export/markdown"
            download="audioneko-highlights.md"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono border border-border bg-surface hover:text-text text-muted hover:border-accent transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Markdown</span>
          </a>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search annotations, quotes, books, or authors..."
          className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-lg text-xs font-mono text-text focus:outline-none focus:border-accent transition-colors placeholder:text-muted"
        />
      </div>

      {/* Bookmarks List */}
      {isLoading ? (
        <div className="surface-card p-12 text-center text-sm font-mono text-muted border border-border">
          Loading your annotations...
        </div>
      ) : filteredBookmarks.length === 0 ? (
        <div className="surface-card p-12 text-center text-xs font-mono text-muted border border-border space-y-2">
          <Bookmark className="w-8 h-8 text-subtle mx-auto mb-2 opacity-50" />
          <p>{searchQuery ? `No notes matching "${searchQuery}"` : "No bookmarks saved yet."}</p>
          <p className="text-subtle text-[11px]">
            Use the bookmark button while listening to save quotes and audio timestamps.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookmarks.map((b) => {
            const isEditing = editingId === b.id;

            return (
              <div
                key={b.id}
                className="surface-card p-4 sm:p-5 border border-border hover:border-border/80 rounded-xl transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <Link
                      to="/book/$id"
                      params={{ id: b.bookId }}
                      className="shrink-0 group"
                      title={b.bookTitle || "View audiobook"}
                    >
                      <img
                        src={getBookCoverUrl(b)}
                        alt={b.bookTitle || "Audiobook cover"}
                        className="w-12 h-12 rounded-lg object-cover border border-border group-hover:border-accent transition-colors bg-surface shadow-sm"
                        loading="lazy"
                      />
                    </Link>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-accent font-mono">
                          {formatDuration(b.positionSeconds)}
                        </span>
                        {b.chapterTitle && (
                          <span className="text-xs font-mono text-muted">• {b.chapterTitle}</span>
                        )}
                      </div>

                      <Link
                        to="/book/$id"
                        params={{ id: b.bookId }}
                        className="block hover:underline"
                      >
                        <h2 className="text-sm sm:text-base font-bold text-text line-clamp-1">
                          {b.bookTitle || "Audiobook"}
                        </h2>
                      </Link>
                      <p className="text-xs font-mono text-muted">
                        By {b.bookAuthor || "Unknown Author"}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setQuoteCardTarget(b)}
                      className="p-1.5 rounded text-muted hover:text-accent hover:bg-surface transition-colors cursor-pointer"
                      title="Generate Quote Card"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(b)}
                      className="p-1.5 rounded text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
                      title="Edit Note"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBookmarkMutation.mutate(b.id)}
                      className="p-1.5 rounded text-muted hover:text-accent hover:bg-surface transition-colors cursor-pointer"
                      title="Delete Bookmark"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Note Content / Editing */}
                {isEditing ? (
                  <div className="space-y-2 pt-1">
                    <textarea
                      rows={2}
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Add quote, reflection, or note..."
                      className="w-full bg-surface border border-border rounded-lg p-2.5 text-xs text-text focus:outline-none focus:border-accent font-sans"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 rounded text-xs font-mono text-muted hover:text-text cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(b.id)}
                        className="px-3 py-1 rounded text-xs font-mono bg-accent text-white font-medium hover:bg-accent-hover cursor-pointer"
                      >
                        Save Note
                      </button>
                    </div>
                  </div>
                ) : b.note ? (
                  <div className="p-3 bg-surface/60 rounded-lg border border-border/50 text-xs sm:text-sm text-text font-serif italic">
                    "{b.note}"
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Quote Card Generator Modal */}
      {quoteCardTarget && (
        <QuoteCardModal
          isOpen={Boolean(quoteCardTarget)}
          onClose={() => setQuoteCardTarget(null)}
          bookTitle={quoteCardTarget.bookTitle || "Audiobook"}
          bookAuthor={quoteCardTarget.bookAuthor || "Unknown Author"}
          chapterTitle={quoteCardTarget.chapterTitle || undefined}
          positionSeconds={quoteCardTarget.positionSeconds}
          initialQuote={quoteCardTarget.note || ""}
        />
      )}
    </div>
  );
}
