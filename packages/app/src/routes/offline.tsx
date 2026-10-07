import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  HardDriveDownload,
  Pause,
  Play,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BlinkingNeko } from "../components/icons/NekoIcon";
import { useAudio } from "../context/audio-context";
import { getBookCoverUrl } from "../lib/covers";
import { type DownloadTask, useDownloads } from "../lib/download-manager";
import {
  type OfflineBookMeta,
  type StorageEstimateResult,
  clearAllDownloadedBooks,
  deleteDownloadedBook,
  getBookCoverBlobUrl,
  getDownloadedBooks,
  getStorageEstimate,
  isOpfsSupported,
} from "../lib/opfs";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "--";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatEta(seconds?: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return "";
  if (seconds < 60) return `${Math.round(seconds)}s remaining`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s remaining`;
}

/**
 * Cover thumbnail component with OPFS blob resolution and fallback
 */
function OfflineCover({
  bookId,
  title,
  coverR2Key,
  className = "w-11 h-16",
}: {
  bookId: string;
  title: string;
  coverR2Key?: string | null;
  className?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let mounted = true;
    getBookCoverBlobUrl(bookId).then((url) => {
      if (mounted && url) {
        setBlobUrl(url);
      }
    });
    return () => {
      mounted = false;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [bookId, blobUrl]);

  const src = blobUrl || getBookCoverUrl({ id: bookId, coverR2Key });

  if (hasError) {
    return (
      <div
        className={`${className} bg-surface border border-border rounded flex flex-col items-center justify-center p-1 text-center shrink-0 select-none`}
      >
        <BookOpen className="w-4 h-4 text-accent/50 mb-0.5" />
        <span className="text-[8px] font-mono text-muted line-clamp-1">{title.slice(0, 10)}</span>
      </div>
    );
  }

  return (
    <div
      className={`${className} bg-elevated border border-border rounded shrink-0 overflow-hidden relative shadow-sm`}
    >
      <img
        src={src}
        alt={title}
        onError={() => setHasError(true)}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );
}

export function OfflinePage() {
  const { playBook } = useAudio();
  const { activeTasks, pause, resume, cancel, pauseAll, resumeAll, cancelAll } = useDownloads();

  const [estimate, setEstimate] = useState<StorageEstimateResult>({
    usageBytes: 0,
    quotaBytes: 0,
    percentUsed: 0,
  });
  const [downloadedBooks, setDownloadedBooks] = useState<OfflineBookMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "title" | "size" | "duration">("recent");

  const supported = isOpfsSupported();

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [est, books] = await Promise.all([getStorageEstimate(), getDownloadedBooks()]);
      setEstimate(est);
      setDownloadedBooks(books);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleDelete = async (bookId: string) => {
    setDeletingId(bookId);
    try {
      await deleteDownloadedBook(bookId);
      await refreshData();
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to delete all offline audiobooks from this device?")) {
      return;
    }
    setIsLoading(true);
    try {
      await clearAllDownloadedBooks();
      await refreshData();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayDownloaded = (book: OfflineBookMeta) => {
    playBook(
      {
        id: book.bookId,
        title: book.title,
        author: book.author,
        durationSeconds: book.durationSeconds,
        format: book.format || "m4b",
        driveFolderId: "",
        fileSizeBytes: book.fileSizeBytes,
        isActiveShelf: true,
        createdAt: book.downloadedAt,
        updatedAt: book.downloadedAt,
      },
      0,
      book.chapters ?? [],
    );
  };

  // Filter & sort downloaded books
  const filteredBooks = useMemo(() => {
    let result = [...downloadedBooks];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => {
      if (sortBy === "recent") return b.downloadedAt - a.downloadedAt;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "size") return b.fileSizeBytes - a.fileSizeBytes;
      if (sortBy === "duration") return b.durationSeconds - a.durationSeconds;
      return 0;
    });

    return result;
  }, [downloadedBooks, searchQuery, sortBy]);

  const hasDownloadingTasks = activeTasks.some((t) => t.status === "downloading");
  const hasPausedTasks = activeTasks.some((t) => t.status === "paused");

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-32">
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

      {/* Header banner */}
      <div className="surface-card p-4 sm:p-6 md:p-8 border border-border space-y-4 rounded-xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-accent-bg border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <HardDriveDownload className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-text truncate">
              Offline Storage (OPFS)
            </h1>
            <p className="text-xs font-mono text-muted mt-0.5 line-clamp-1">
              Client-side private filesystem storage • Instant local playback and offline sync
            </p>
          </div>
        </div>

        {!supported ? (
          <div className="p-4 rounded border border-border bg-elevated text-xs font-mono text-muted">
            Origin Private File System (OPFS) is not supported in this browser. Please use Chrome,
            Safari, or Edge to download audiobooks for offline playback.
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-muted">LOCAL DISK USAGE</span>
              <span className="text-text">
                {formatBytes(estimate.usageBytes)} / {formatBytes(estimate.quotaBytes)} (
                {estimate.percentUsed}%)
              </span>
            </div>

            <div className="h-2 w-full bg-elevated rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${Math.max(1, Math.min(100, estimate.percentUsed))}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-subtle gap-2">
              <p>
                Downloaded books are cached directly to your device disk using the Origin Private
                File System and served offline via the audioneko Service Worker.
              </p>
              <span className="text-muted">
                {downloadedBooks.length} audiobook{downloadedBooks.length === 1 ? "" : "s"} stored
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Active & Queued Downloads Section */}
      {supported && activeTasks.length > 0 && (
        <div className="surface-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <BlinkingNeko className="w-3.5 h-3.5 text-accent" />
              <h2 className="text-sm font-semibold text-text tracking-tight">
                Active Downloads ({activeTasks.length})
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {hasDownloadingTasks ? (
                <button
                  type="button"
                  onClick={pauseAll}
                  className="px-2.5 py-1 text-xs font-mono border border-border bg-surface text-muted hover:text-text rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause All</span>
                </button>
              ) : hasPausedTasks ? (
                <button
                  type="button"
                  onClick={resumeAll}
                  className="px-2.5 py-1 text-xs font-mono border border-accent/40 bg-accent-bg text-accent rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume All</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={cancelAll}
                className="px-2.5 py-1 text-xs font-mono border border-border bg-surface text-muted hover:text-accent rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel All</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {activeTasks.map((task) => (
              <div
                key={task.bookId}
                className="p-3 bg-surface border border-border rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <OfflineCover
                      bookId={task.bookId}
                      title={task.title}
                      coverR2Key={task.coverR2Key}
                      className="w-10 h-14"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text truncate">{task.title}</p>
                        {task.status === "downloading" ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/15 text-accent border border-accent/30 flex items-center gap-1.5">
                            <BlinkingNeko className="w-3 h-3 text-accent" />
                            Downloading
                          </span>
                        ) : task.status === "paused" ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Paused
                          </span>
                        ) : task.status === "queued" ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-elevated text-muted border border-border">
                            Queued
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/15 text-red-400 border border-red-500/30">
                            Error
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted truncate mt-0.5">{task.author}</p>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-subtle mt-1">
                        <span>
                          {formatBytes(task.downloadedBytes)} / {formatBytes(task.totalBytes)} (
                          {task.progressPercent}%)
                        </span>
                        {task.speedBytesPerSec && task.speedBytesPerSec > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-accent">
                              {formatBytes(task.speedBytesPerSec)}/s
                            </span>
                          </>
                        )}
                        {task.estimatedTimeSeconds && task.estimatedTimeSeconds > 0 && (
                          <>
                            <span>•</span>
                            <span>{formatEta(task.estimatedTimeSeconds)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {task.status === "downloading" ? (
                      <button
                        type="button"
                        onClick={() => pause(task.bookId)}
                        className="p-1.5 rounded bg-surface hover:bg-elevated border border-border text-muted hover:text-text cursor-pointer transition-colors"
                        title="Pause Download"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => resume(task.bookId)}
                        className="p-1.5 rounded bg-accent-bg border border-accent/30 text-accent hover:bg-accent/20 cursor-pointer transition-colors"
                        title="Resume Download"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => cancel(task.bookId)}
                      className="p-1.5 rounded bg-surface hover:bg-elevated border border-border text-muted hover:text-accent cursor-pointer transition-colors"
                      title="Cancel Download"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full bg-elevated rounded-full overflow-hidden border border-border/50">
                  <div
                    className={`h-full transition-all duration-200 ${
                      task.status === "paused"
                        ? "bg-amber-400"
                        : task.status === "error"
                          ? "bg-red-400"
                          : "bg-accent"
                    }`}
                    style={{ width: `${Math.max(1, Math.min(100, task.progressPercent))}%` }}
                  />
                </div>

                {task.errorMessage && (
                  <p className="text-[11px] font-mono text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{task.errorMessage}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Downloaded audiobooks section */}
      {supported && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-mono uppercase tracking-wider text-text font-semibold">
              Downloaded Audiobooks ({downloadedBooks.length})
            </h2>

            {downloadedBooks.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter downloads..."
                    className="pl-8 pr-3 py-1 bg-surface border border-border rounded-lg text-xs font-mono text-text placeholder:text-muted focus:outline-none focus:border-accent w-36 sm:w-48"
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  aria-label="Sort audiobooks by"
                  className="bg-surface border border-border rounded-lg px-2 py-1 text-xs font-mono text-muted focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="recent">Recent</option>
                  <option value="title">Title A-Z</option>
                  <option value="size">File Size</option>
                  <option value="duration">Duration</option>
                </select>

                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs font-mono text-accent hover:underline cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete All</span>
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm font-mono text-muted">
              Loading offline storage...
            </div>
          ) : downloadedBooks.length === 0 ? (
            <div className="surface-card p-8 sm:p-12 text-center border border-dashed border-border rounded-xl space-y-2">
              <p className="text-sm font-medium text-text">No audiobooks downloaded yet</p>
              <p className="text-xs text-muted max-w-sm mx-auto">
                Navigate to any audiobook in your library and click "Download" to store it locally
                for offline listening on flights or commutes.
              </p>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="surface-card p-8 text-center border border-dashed border-border rounded-xl">
              <p className="text-xs font-mono text-muted">
                No downloaded books matching "{searchQuery}"
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-bg">
              {filteredBooks.map((book) => (
                <div
                  key={book.bookId}
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface/50 transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-3.5 flex-1">
                    <OfflineCover
                      bookId={book.bookId}
                      title={book.title}
                      coverR2Key={book.coverR2Key}
                      className="w-11 h-16 shadow-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text truncate">{book.title}</p>
                      <p className="text-xs text-muted truncate mt-0.5">{book.author}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-subtle mt-1">
                        <span>{formatBytes(book.fileSizeBytes)}</span>
                        <span>•</span>
                        <span>{formatDuration(book.durationSeconds)}</span>
                        <span>•</span>
                        <span>Downloaded {formatDate(book.downloadedAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                    <button
                      type="button"
                      onClick={() => handlePlayDownloaded(book)}
                      className="px-3.5 py-1.5 text-xs font-mono font-medium bg-accent text-bg rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play Offline</span>
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === book.bookId}
                      onClick={() => handleDelete(book.bookId)}
                      className="p-1.5 text-muted hover:text-accent hover:bg-accent-bg border border-border rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                      title="Delete offline copy"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
