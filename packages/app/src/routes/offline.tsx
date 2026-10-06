import { Link } from "@tanstack/react-router";
import { ArrowLeft, HardDriveDownload, Play, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAudio } from "../context/audio-context";
import {
  type OfflineBookMeta,
  type StorageEstimateResult,
  clearAllDownloadedBooks,
  deleteDownloadedBook,
  getDownloadedBooks,
  getStorageEstimate,
  isOpfsSupported,
} from "../lib/opfs";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
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

export function OfflinePage() {
  const { playBook } = useAudio();
  const [estimate, setEstimate] = useState<StorageEstimateResult>({
    usageBytes: 0,
    quotaBytes: 0,
    percentUsed: 0,
  });
  const [downloadedBooks, setDownloadedBooks] = useState<OfflineBookMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        format: "m4b",
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
      <div className="surface-card p-4 sm:p-6 md:p-8 border border-border space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-accent-bg border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <HardDriveDownload className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-text truncate">
              Offline Storage (OPFS)
            </h1>
            <p className="text-xs font-mono text-muted mt-0.5 line-clamp-1">
              Client-side private filesystem storage • Zero server bandwidth costs
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
            <p className="text-[11px] font-mono text-subtle">
              Downloaded books are cached directly to your device disk using the Origin Private File
              System and served offline via the audioneko Service Worker.
            </p>
          </div>
        )}
      </div>

      {/* Downloaded audiobooks table */}
      {supported && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-wider text-text font-semibold">
              Downloaded Audiobooks ({downloadedBooks.length})
            </h2>
            {downloadedBooks.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs font-mono text-accent hover:underline cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete All</span>
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm font-mono text-muted">
              Loading offline storage...
            </div>
          ) : downloadedBooks.length === 0 ? (
            <div className="surface-card p-8 sm:p-12 text-center border border-dashed border-border rounded-lg space-y-2">
              <p className="text-sm font-medium text-text">No audiobooks downloaded yet</p>
              <p className="text-xs text-muted max-w-sm mx-auto">
                Navigate to any audiobook in your library and click "Download" to store it locally
                for offline listening on flights or commutes.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-bg">
              {downloadedBooks.map((book) => (
                <div
                  key={book.bookId}
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface/50 transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-3 flex-1">
                    <div className="w-10 h-14 bg-elevated border border-border rounded shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-mono text-subtle">
                      {book.coverR2Key ? (
                        <img
                          src={`/api/covers/${book.bookId}`}
                          alt={book.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        "AUDIO"
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text truncate">{book.title}</p>
                      <p className="text-xs text-muted truncate mt-0.5">{book.author}</p>
                      <p className="text-[11px] font-mono text-subtle mt-1 truncate">
                        {formatBytes(book.fileSizeBytes)} • Downloaded{" "}
                        {formatDate(book.downloadedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                    <button
                      type="button"
                      onClick={() => handlePlayDownloaded(book)}
                      className="px-3 py-1.5 text-xs font-mono font-medium bg-accent text-bg rounded hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play Offline</span>
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === book.bookId}
                      onClick={() => handleDelete(book.bookId)}
                      className="p-1.5 text-muted hover:text-accent hover:bg-accent-bg border border-border rounded cursor-pointer transition-colors disabled:opacity-50"
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
