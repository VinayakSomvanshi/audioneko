import type { Book } from "@audioneko/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  FolderPlus,
  Loader2,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { getBookCoverUrl } from "../lib/covers";

interface CustomShelf {
  id: string;
  name: string;
  isPublic: boolean;
  createdAt: string;
  items: Array<{
    id: string;
    shelfId: string;
    bookId: string;
    orderIndex: number;
    bookTitle?: string;
    bookAuthor?: string;
    coverR2Key?: string;
    durationSeconds?: number;
    format?: string;
  }>;
}

export function ShelvesPage() {
  const queryClient = useQueryClient();
  const [newShelfName, setNewShelfName] = useState("");
  const [isCreatingShelf, setIsCreatingShelf] = useState(false);
  const [addingBookShelfId, setAddingBookShelfId] = useState<string | null>(null);
  const [shelfBookSearch, setShelfBookSearch] = useState("");

  // 1. Fetch user custom shelves
  const { data: shelvesData, isLoading: shelvesLoading } = useQuery<{ shelves: CustomShelf[] }>({
    queryKey: ["customShelves"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/shelves");
        if (!res.ok) return { shelves: [] };
        return await res.json();
      } catch {
        return { shelves: [] };
      }
    },
    staleTime: 15_000,
  });

  // 2. Fetch all books from the library
  const { data: booksData } = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const res = await fetch("/api/books");
      if (!res.ok) return { books: [] as Book[] };
      return (await res.json()) as { books: Book[] };
    },
    staleTime: 30_000,
  });

  // Create shelf mutation
  const createShelfMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create shelf");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customShelves"] });
      setNewShelfName("");
      setIsCreatingShelf(false);
    },
  });

  // Delete shelf mutation
  const deleteShelfMutation = useMutation({
    mutationFn: async (shelfId: string) => {
      const res = await fetch(`/api/shelves/${shelfId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete shelf");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customShelves"] });
    },
  });

  // Add book to shelf mutation
  const addBookMutation = useMutation({
    mutationFn: async ({ shelfId, bookId }: { shelfId: string; bookId: string }) => {
      const res = await fetch(`/api/shelves/${shelfId}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      if (!res.ok) throw new Error("Failed to add book to shelf");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customShelves"] });
      setAddingBookShelfId(null);
      setShelfBookSearch("");
    },
  });

  // Remove book from shelf mutation
  const removeBookMutation = useMutation({
    mutationFn: async ({ shelfId, bookId }: { shelfId: string; bookId: string }) => {
      const res = await fetch(`/api/shelves/${shelfId}/books/${bookId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove book from shelf");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customShelves"] });
    },
  });

  const allBooks = booksData?.books ?? [];
  const customShelves = shelvesData?.shelves ?? [];

  return (
    <div className="space-y-8 pb-32">
      {/* Back link */}
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
      <div className="surface-card p-6 md:p-8 border border-border space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-accent-bg border border-accent/20 flex items-center justify-center text-accent">
              <Bookmark className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-text">Bookshelves</h1>
              <p className="text-xs font-mono text-muted mt-0.5">
                Organize and curate your personal audiobook reading lists
              </p>
            </div>
          </div>

          {/* Action button */}
          {!isCreatingShelf && (
            <button
              type="button"
              onClick={() => setIsCreatingShelf(true)}
              className="px-4 py-2 rounded bg-accent text-bg text-xs font-mono font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer self-start md:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Shelf</span>
            </button>
          )}
        </div>

        {/* Inline Create Shelf Form */}
        {isCreatingShelf && (
          <div className="p-4 rounded bg-elevated border border-border space-y-3 pt-3">
            <div className="text-xs font-mono text-text font-medium">Create a new bookshelf</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Shelf name (e.g. Favorites, Up Next)..."
                value={newShelfName}
                onChange={(e) => setNewShelfName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newShelfName.trim()) {
                    createShelfMutation.mutate(newShelfName.trim());
                  } else if (e.key === "Escape") {
                    setIsCreatingShelf(false);
                  }
                }}
                className="bg-surface border border-border focus:border-accent rounded px-3 py-1.5 text-xs font-mono text-text flex-1 min-w-[200px] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (newShelfName.trim()) {
                    createShelfMutation.mutate(newShelfName.trim());
                  }
                }}
                disabled={!newShelfName.trim() || createShelfMutation.isPending}
                className="px-3.5 py-1.5 rounded bg-accent text-bg text-xs font-mono font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                {createShelfMutation.isPending ? "Creating..." : "Create Shelf"}
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingShelf(false)}
                className="px-3 py-1.5 text-xs font-mono text-muted hover:text-text cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* Shelves List Section */}
      {/* ========================================== */}
      <div className="space-y-6">
        {shelvesLoading ? (
          <div className="surface-card p-12 text-center text-xs font-mono text-muted flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            <span>Loading your bookshelves...</span>
          </div>
        ) : customShelves.length === 0 ? (
          <div className="surface-card p-12 border border-border text-center space-y-4">
            <FolderPlus className="w-12 h-12 text-muted mx-auto" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-text">No bookshelves yet</h3>
              <p className="text-xs font-mono text-muted max-w-sm mx-auto">
                Create custom shelves to group your audiobooks by mood, priority, or favorites.
              </p>
            </div>

            {/* Quick Starter Presets */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {["Favorites", "Up Next", "Currently Listening", "Completed"].map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => createShelfMutation.mutate(name)}
                  disabled={createShelfMutation.isPending}
                  className="px-3 py-1.5 rounded bg-elevated border border-border hover:border-accent text-xs font-mono text-text transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>Create "{name}"</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {customShelves.map((shelf) => {
              const isAddingBooks = addingBookShelfId === shelf.id;
              const shelfBookIds = new Set(shelf.items.map((i) => i.bookId));
              const availableToAdd = allBooks.filter((b) => !shelfBookIds.has(b.id));
              const filteredAvailableToAdd = availableToAdd.filter((b) => {
                if (!shelfBookSearch.trim()) return true;
                const q = shelfBookSearch.trim().toLowerCase();
                return (
                  b.title.toLowerCase().includes(q) || Boolean(b.author?.toLowerCase().includes(q))
                );
              });

              return (
                <div
                  key={shelf.id}
                  className="surface-card p-5 md:p-6 border border-border space-y-4"
                >
                  {/* Shelf Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                    <div className="flex items-center gap-2.5">
                      <Bookmark className="w-4 h-4 text-accent" />
                      <h2 className="text-base font-bold text-text">{shelf.name}</h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-muted">
                        {shelf.items.length} {shelf.items.length === 1 ? "book" : "books"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (isAddingBooks) {
                            setAddingBookShelfId(null);
                            setShelfBookSearch("");
                          } else {
                            setAddingBookShelfId(shelf.id);
                            setShelfBookSearch("");
                          }
                        }}
                        className={`px-3 py-1 rounded text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5 border ${
                          isAddingBooks
                            ? "bg-accent text-bg border-accent font-semibold"
                            : "bg-elevated text-text border-border hover:border-accent"
                        }`}
                      >
                        {isAddingBooks ? (
                          <>
                            <X className="w-3 h-3" />
                            <span>Done Adding</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3 text-accent" />
                            <span>Add Books</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete the "${shelf.name}" shelf?`)) {
                            deleteShelfMutation.mutate(shelf.id);
                          }
                        }}
                        className="text-muted hover:text-error p-1.5 rounded transition-colors cursor-pointer"
                        title="Delete shelf"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Book Selector when "Add Books" is active */}
                  {isAddingBooks && (
                    <div className="p-4 rounded bg-elevated border border-border space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="text-xs font-mono text-text font-medium">
                          Add an audiobook to <span className="text-accent">{shelf.name}</span>:
                        </div>
                        <div className="relative w-full sm:w-60">
                          <Search className="w-3 h-3 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Search library..."
                            value={shelfBookSearch}
                            onChange={(e) => setShelfBookSearch(e.target.value)}
                            className="w-full bg-surface border border-border focus:border-accent rounded pl-7 pr-3 py-1 text-xs font-mono text-text placeholder:text-muted focus:outline-none"
                          />
                        </div>
                      </div>

                      {filteredAvailableToAdd.length === 0 ? (
                        <div className="text-xs font-mono text-muted text-center py-4">
                          {availableToAdd.length === 0
                            ? "All library books are already on this shelf!"
                            : "No matching books found."}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
                          {filteredAvailableToAdd.map((book) => (
                            <div
                              key={book.id}
                              className="surface-card p-2 border border-border flex items-center justify-between gap-2 hover:border-accent/40 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 rounded border border-border bg-surface overflow-hidden shrink-0">
                                  {book.coverR2Key ? (
                                    <img
                                      src={getBookCoverUrl(book)}
                                      alt={book.title}
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <Bookmark className="w-3 h-3 text-muted m-auto mt-2.5" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-text truncate">
                                    {book.title}
                                  </div>
                                  <div className="text-[10px] font-mono text-muted truncate">
                                    {book.author}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  addBookMutation.mutate({ shelfId: shelf.id, bookId: book.id })
                                }
                                disabled={addBookMutation.isPending}
                                className="px-2 py-1 rounded bg-accent text-bg text-[11px] font-mono font-medium hover:opacity-90 cursor-pointer shrink-0 flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Books on this Shelf */}
                  {shelf.items.length === 0 ? (
                    <div className="p-8 rounded bg-surface border border-dashed border-border text-center space-y-2">
                      <p className="text-xs font-mono text-muted">
                        No audiobooks on this shelf yet.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingBookShelfId(shelf.id);
                          setShelfBookSearch("");
                        }}
                        className="px-3 py-1 rounded bg-elevated border border-border hover:border-accent text-xs font-mono text-accent transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add an Audiobook</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {shelf.items.map((item) => (
                        <div
                          key={item.id}
                          className="surface-card p-3 border border-border flex items-center justify-between gap-3 hover:border-border/80 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded border border-border bg-surface overflow-hidden shrink-0">
                              {item.coverR2Key ? (
                                <img
                                  src={`/api/covers/${item.bookId}`}
                                  alt={item.bookTitle || ""}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <Bookmark className="w-4 h-4 text-muted m-auto mt-3" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <Link
                                to="/book/$id"
                                params={{ id: item.bookId }}
                                className="text-xs font-medium text-text hover:text-accent truncate block"
                              >
                                {item.bookTitle || "Audiobook"}
                              </Link>
                              <div className="text-[10px] font-mono text-muted truncate">
                                {item.bookAuthor || ""}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Link
                              to="/book/$id"
                              params={{ id: item.bookId }}
                              className="p-1.5 rounded hover:bg-elevated text-muted hover:text-accent transition-colors"
                              title="Listen"
                            >
                              <Play className="w-3.5 h-3.5 text-accent" />
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                removeBookMutation.mutate({
                                  shelfId: shelf.id,
                                  bookId: item.bookId,
                                })
                              }
                              disabled={removeBookMutation.isPending}
                              className="p-1.5 rounded hover:bg-elevated text-muted hover:text-error transition-colors cursor-pointer"
                              title="Remove from shelf"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
