import type { Book } from "@audioneko/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  FolderPlus,
  HardDrive,
  Info,
  Layers,
  Loader2,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Zap,
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

interface ActiveShelfStatus {
  isR2Enabled: boolean;
  totalCachedBytes: number;
  maxCapacityBytes: number;
  usagePercent: number;
  cachedCount: number;
  books: Array<{
    bookId: string;
    title: string;
    sizeBytes: number;
    cachedAt?: number;
  }>;
}

export function ShelvesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"custom" | "active-shelf">("active-shelf");
  const [newShelfName, setNewShelfName] = useState("");
  const [isCreatingShelf, setIsCreatingShelf] = useState(false);
  const [stageSearch, setStageSearch] = useState("");
  const [stagingBookId, setStagingBookId] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);

  // 1. Fetch Active Shelf (R2 Cache) status
  const { data: shelfStatus } = useQuery<ActiveShelfStatus>({
    queryKey: ["shelfStatus"],
    queryFn: async () => {
      const res = await fetch("/api/shelf/status");
      if (!res.ok) {
        return {
          isR2Enabled: false,
          totalCachedBytes: 0,
          maxCapacityBytes: 8.5 * 1024 * 1024 * 1024,
          usagePercent: 0,
          cachedCount: 0,
          books: [],
        };
      }
      return await res.json();
    },
    staleTime: 15_000,
  });

  // 2. Fetch all books for reference
  const { data: booksData } = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const res = await fetch("/api/books");
      if (!res.ok) return { books: [] as Book[] };
      return (await res.json()) as { books: Book[] };
    },
    staleTime: 30_000,
  });

  // 3. Fetch user custom shelves
  const { data: shelvesData } = useQuery<{ shelves: CustomShelf[] }>({
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

  // Precache mutation (Stage to R2)
  const precacheMutation = useMutation({
    mutationFn: async (bookId: string) => {
      setStagingBookId(bookId);
      setStageError(null);
      const res = await fetch(`/api/shelf/precache/${bookId}`, { method: "POST" });
      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        throw new Error(
          errorData.error || errorData.message || "Failed to stage audiobook to Active Shelf",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      setStageError(null);
      queryClient.invalidateQueries({ queryKey: ["shelfStatus"] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (err: Error) => {
      setStageError(err.message);
    },
    onSettled: () => {
      setStagingBookId(null);
    },
  });

  // Remove from R2 mutation
  const evictMutation = useMutation({
    mutationFn: async (bookId: string) => {
      const res = await fetch(`/api/shelf/${bookId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove from active shelf");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shelfStatus"] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
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

  const allBooks = booksData?.books ?? [];
  const customShelves = shelvesData?.shelves ?? [];

  const unstagedBooks = allBooks.filter((b) => !b.isActiveShelf);
  const filteredUnstagedBooks = unstagedBooks.filter((b) => {
    if (!stageSearch.trim()) return true;
    const q = stageSearch.trim().toLowerCase();
    return b.title.toLowerCase().includes(q) || Boolean(b.author?.toLowerCase().includes(q));
  });

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 MB";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const cachedBytes = shelfStatus?.totalCachedBytes ?? 0;
  const maxBytes = shelfStatus?.maxCapacityBytes ?? 8.5 * 1024 * 1024 * 1024;
  const usagePct = Math.min(100, Math.round((cachedBytes / maxBytes) * 100));

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
              <h1 className="text-xl md:text-2xl font-bold text-text">Shelves & Storage Tiers</h1>
              <p className="text-xs font-mono text-muted mt-0.5">
                Active fast-cache staging and personal curated reading lists
              </p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 bg-elevated p-1 rounded border border-border">
            <button
              type="button"
              onClick={() => setActiveTab("active-shelf")}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "active-shelf"
                  ? "bg-accent text-bg font-semibold"
                  : "text-muted hover:text-text"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>
                {shelfStatus?.isR2Enabled ? "Active Shelf (R2 Cache)" : "Storage & Drive Tiers"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("custom")}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "custom"
                  ? "bg-accent text-bg font-semibold"
                  : "text-muted hover:text-text"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Custom Collections</span>
            </button>
          </div>
        </div>

        {/* Informative Explanation Callout */}
        <div className="p-4 rounded bg-surface border border-border/80 text-xs font-mono space-y-1.5 text-muted">
          <div className="flex items-center gap-2 text-text font-semibold">
            <Info className="w-4 h-4 text-accent" />
            <span>Understanding Shelves in audioneko</span>
          </div>
          <p className="leading-relaxed">
            <strong className="text-accent">1. Direct Drive & Storage Tiers:</strong> Audioneko
            streams directly from your Google Drive without requiring credit card or billing
            details.
          </p>
          <p className="leading-relaxed">
            <strong className="text-text">2. Custom Collections:</strong> Personalized bookshelves
            created by you (e.g. "Favorites", "Up Next", "Classics") to organize and categorize your
            library.
          </p>
        </div>
      </div>

      {/* ========================================== */}
      {/* TAB 1: Cloudflare R2 Active Shelf Staging */}
      {/* ========================================== */}
      {activeTab === "active-shelf" && (
        <div className="space-y-6">
          {/* Status Alert if R2 is not active */}
          {!shelfStatus?.isR2Enabled && (
            <div className="p-4 rounded surface-card border border-accent/30 bg-accent-bg/10 space-y-2 text-xs font-mono">
              <div className="flex items-center gap-2 text-accent font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-accent" />
                <span>100% Free Direct Google Drive Streaming Active</span>
              </div>
              <p className="text-muted leading-relaxed">
                You do <strong className="text-text font-semibold">not</strong> need to enter any
                payment or credit card details into Cloudflare. Audioneko streams all your
                audiobooks directly from your Google Drive with zero server storage costs and zero
                billing info needed.
              </p>
              <p className="text-subtle text-[11px] leading-relaxed">
                Cloudflare R2 is completely optional. All {allBooks.length} audiobooks in your
                library are ready to listen to right now! You can also use the{" "}
                <strong className="text-text">Custom Collections</strong> tab above to create
                personalized bookshelves (Favorites, Up Next, etc.).
              </p>
            </div>
          )}

          {/* Staging Error Toast / Alert Banner */}
          {stageError && (
            <div className="p-3.5 rounded border border-error/40 bg-error/10 text-xs font-mono flex items-start justify-between gap-3 text-error">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold">Staging Operation Note</div>
                  <div className="text-[11px] opacity-90 break-words">{stageError}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStageError(null)}
                className="text-xs hover:underline cursor-pointer opacity-70 hover:opacity-100 shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Storage Meter Card */}
          <div className="surface-card p-6 border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <HardDrive className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-bold font-mono text-text uppercase">
                  Tier 2 Active Shelf Capacity
                </h2>
                {shelfStatus?.isR2Enabled ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-accent/30 bg-accent-bg text-accent">
                    R2 EDGE ACTIVE
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-warning/30 bg-warning/10 text-warning">
                    DIRECT DRIVE MODE
                  </span>
                )}
              </div>
              <div className="text-xs font-mono text-muted">
                <span className="text-accent font-semibold">{formatBytes(cachedBytes)}</span> /{" "}
                <span>{formatBytes(maxBytes)}</span> ({usagePct}% utilized)
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-elevated overflow-hidden border border-border">
              <div
                className="h-full bg-accent transition-all duration-500 rounded-full"
                style={{ width: `${Math.max(2, usagePct)}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-subtle pt-1">
              <span>Zero-cost rule: Automatically maintained via LRU eviction under 8.5 GB</span>
              <span className="text-accent font-medium">
                {shelfStatus?.cachedCount ?? 0} Audiobooks currently cached
              </span>
            </div>
          </div>

          {/* Staged Books List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-xs font-mono uppercase tracking-wider text-text font-bold">
                Audiobooks in Active Cache
              </h3>
              <span className="text-xs font-mono text-subtle">
                {allBooks.filter((b) => b.isActiveShelf).length} staged
              </span>
            </div>

            {allBooks.filter((b) => b.isActiveShelf).length === 0 ? (
              <div className="surface-card p-8 border border-border text-center space-y-2">
                <Zap className="w-8 h-8 text-muted mx-auto" />
                <h4 className="text-sm font-semibold text-text">Active Shelf is currently empty</h4>
                <p className="text-xs font-mono text-muted max-w-md mx-auto">
                  {shelfStatus?.isR2Enabled
                    ? "When you listen to an audiobook or click 'Stage' below, the file is pre-cached on Cloudflare R2 for instant playback."
                    : "Audiobooks stream directly from your Google Drive. Once Cloudflare R2 is enabled on your account, audiobooks can be staged to the edge cache."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {allBooks
                  .filter((b) => b.isActiveShelf)
                  .map((book) => (
                    <div
                      key={book.id}
                      className="surface-card p-3 border border-border flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded border border-border bg-surface overflow-hidden shrink-0">
                          {book.coverR2Key ? (
                            <img
                              src={getBookCoverUrl(book)}
                              alt={book.title}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Bookmark className="w-4 h-4 text-muted m-auto mt-3" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            to="/book/$id"
                            params={{ id: book.id }}
                            className="text-xs font-semibold text-text hover:text-accent truncate block"
                          >
                            {book.title}
                          </Link>
                          <p className="text-[11px] font-mono text-muted truncate">{book.author}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-accent bg-accent-bg px-2 py-0.5 rounded border border-accent/20">
                          CACHED
                        </span>
                        <button
                          type="button"
                          onClick={() => evictMutation.mutate(book.id)}
                          disabled={evictMutation.isPending}
                          className="text-xs font-mono text-muted hover:text-error px-2 py-1 transition-colors cursor-pointer"
                        >
                          Evict
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Quick Staging / Library Books Section */}
          <div className="space-y-4 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <h3 className="text-xs font-mono uppercase tracking-wider text-text font-bold">
                  {shelfStatus?.isR2Enabled
                    ? "Available to Stage (From Tier 1 Drive Cold)"
                    : "Audiobooks Available to Stream (Direct Drive)"}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-muted">
                  {filteredUnstagedBooks.length}
                  {filteredUnstagedBooks.length !== unstagedBooks.length
                    ? ` / ${unstagedBooks.length}`
                    : ""}{" "}
                  available
                </span>
              </div>

              {/* Search filter for books */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter audiobooks..."
                  value={stageSearch}
                  onChange={(e) => setStageSearch(e.target.value)}
                  className="w-full bg-elevated border border-border focus:border-accent rounded pl-8 pr-3 py-1.5 text-xs font-mono text-text placeholder:text-muted focus:outline-none transition-colors"
                />
              </div>
            </div>

            {filteredUnstagedBooks.length === 0 ? (
              <div className="surface-card p-6 border border-border text-center text-xs font-mono text-muted space-y-1">
                {stageSearch.trim() ? (
                  <>
                    <p className="text-text font-medium">No matching audiobooks found</p>
                    <p className="text-[11px] text-subtle">
                      No unstaged books match "{stageSearch}". Clear the search to view all{" "}
                      {unstagedBooks.length} available books.
                    </p>
                  </>
                ) : (
                  <p>All books in your library are currently staged on the Active Shelf!</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredUnstagedBooks.map((book) => {
                  const isThisBookStaging = stagingBookId === book.id;
                  const canStage = !!shelfStatus?.isR2Enabled;

                  return (
                    <div
                      key={book.id}
                      className="surface-card p-3 border border-border flex items-center justify-between gap-3 hover:border-border/80 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded border border-border bg-surface overflow-hidden shrink-0">
                          {book.coverR2Key ? (
                            <img
                              src={getBookCoverUrl(book)}
                              alt={book.title}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Bookmark className="w-4 h-4 text-muted m-auto mt-3" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            to="/book/$id"
                            params={{ id: book.id }}
                            className="text-xs font-medium text-text hover:text-accent truncate block"
                          >
                            {book.title}
                          </Link>
                          <div className="text-[10px] font-mono text-muted truncate">
                            {book.author}
                          </div>
                        </div>
                      </div>

                      {canStage ? (
                        <button
                          type="button"
                          onClick={() => precacheMutation.mutate(book.id)}
                          disabled={precacheMutation.isPending}
                          title="Stage to Cloudflare R2 edge cache"
                          className="px-2.5 py-1.5 rounded bg-elevated border border-border hover:border-accent text-xs font-mono text-text hover:text-accent disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
                        >
                          {isThisBookStaging ? (
                            <>
                              <Loader2 className="w-3 h-3 text-accent animate-spin" />
                              <span>Staging...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3 h-3 text-accent" />
                              <span>Stage</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <Link
                          to="/book/$id"
                          params={{ id: book.id }}
                          className="px-2.5 py-1.5 rounded bg-elevated border border-border hover:border-accent text-xs font-mono text-text hover:text-accent transition-colors shrink-0 flex items-center gap-1.5"
                        >
                          <Play className="w-3 h-3 text-accent" />
                          <span>Listen</span>
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 2: Custom Collections & Shelves */}
      {/* ========================================== */}
      {activeTab === "custom" && (
        <div className="space-y-6">
          {/* Create Shelf Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border pb-4">
            <h2 className="text-sm font-bold font-mono text-text uppercase">
              Your Custom Bookshelves
            </h2>

            {isCreatingShelf ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Shelf name (e.g. Favorites)..."
                  value={newShelfName}
                  onChange={(e) => setNewShelfName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newShelfName.trim()) {
                      createShelfMutation.mutate(newShelfName.trim());
                    }
                  }}
                  className="bg-elevated border border-border rounded px-3 py-1 text-xs font-mono text-text focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newShelfName.trim()) {
                      createShelfMutation.mutate(newShelfName.trim());
                    }
                  }}
                  disabled={!newShelfName.trim() || createShelfMutation.isPending}
                  className="px-3 py-1 rounded bg-accent text-bg text-xs font-mono font-medium hover:opacity-90 cursor-pointer"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingShelf(false)}
                  className="px-2 py-1 text-xs font-mono text-muted hover:text-text cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreatingShelf(true)}
                className="px-3 py-1.5 rounded bg-accent text-bg font-mono font-medium text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Shelf</span>
              </button>
            )}
          </div>

          {/* Shelves List or Empty State */}
          {customShelves.length === 0 ? (
            <div className="surface-card p-12 border border-border text-center space-y-4">
              <FolderPlus className="w-12 h-12 text-muted mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-text">No custom shelves yet</h3>
                <p className="text-xs font-mono text-muted max-w-sm mx-auto">
                  Organize your audiobooks by mood, priority, or genre with custom shelves.
                </p>
              </div>

              {/* Starter Quick Actions */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {["Favorites", "Up Next", "Completed", "Want to Listen"].map((name) => (
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customShelves.map((shelf) => (
                <div
                  key={shelf.id}
                  className="surface-card p-5 border border-border space-y-4 flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Bookmark className="w-4 h-4 text-accent" />
                        <h3 className="text-base font-bold text-text">{shelf.name}</h3>
                      </div>
                      <p className="text-xs font-mono text-muted">
                        {shelf.items.length} audiobooks
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteShelfMutation.mutate(shelf.id)}
                      className="text-muted hover:text-error transition-colors p-1"
                      title="Delete shelf"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Shelf items preview */}
                  {shelf.items.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
                      {shelf.items.slice(0, 4).map((item) => (
                        <div
                          key={item.id}
                          className="aspect-square rounded border border-border bg-surface overflow-hidden relative"
                          title={item.bookTitle}
                        >
                          {item.coverR2Key ? (
                            <img
                              src={`/api/covers/${item.bookId}`}
                              alt={item.bookTitle || ""}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Bookmark className="w-4 h-4 text-muted m-auto mt-4" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded bg-surface border border-dashed border-border text-center text-xs font-mono text-muted">
                      Shelf is empty. Add books from any book's detail page.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
