import type React from "react";
import { useEffect, useState } from "react";
import {
  type OfflineBookMeta,
  type StorageEstimateResult,
  clearAllDownloadedBooks,
  deleteDownloadedBook,
  getDownloadedBooks,
  getStorageEstimate,
  isOpfsSupported,
} from "../../lib/opfs";

interface StorageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayBook?: (bookId: string) => void;
}

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

export const StorageManagerModal: React.FC<StorageManagerModalProps> = ({
  isOpen,
  onClose,
  onPlayBook,
}) => {
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
    if (isOpen) {
      refreshData();
    }
  }, [isOpen, refreshData]);

  if (!isOpen) return null;

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

  return (
    // biome-ignore lint/a11y/useSemanticElements: custom accessible backdrop dialog container
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-none animate-in fade-in duration-150"
    >
      <div className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            <h2 id="storage-modal-title" className="text-lg font-semibold text-text">
              Offline Storage Manager
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text rounded-md hover:bg-elevated transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              role="img"
              aria-label="Close"
            >
              <title>Close</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {!supported ? (
            <div className="p-4 rounded-lg border border-border bg-elevated text-sm text-text-muted">
              Origin Private File System (OPFS) is not supported in this browser. Please use Chrome,
              Safari, or Edge for offline audiobook storage.
            </div>
          ) : (
            <>
              {/* Storage Meter */}
              <div className="p-4 rounded-lg border border-border bg-elevated space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-muted">Device Storage Usage</span>
                  <span className="font-mono text-xs text-text">
                    {formatBytes(estimate.usageBytes)} / {formatBytes(estimate.quotaBytes)} (
                    {estimate.percentUsed}%)
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full bg-bg rounded-full overflow-hidden border border-border">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${Math.max(1, Math.min(100, estimate.percentUsed))}%` }}
                  />
                </div>
                <p className="text-xs text-text-subtle">
                  Downloaded audiobooks are stored locally on your device in OPFS for offline
                  playback.
                </p>
              </div>

              {/* Downloaded Books List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text uppercase tracking-wider">
                    Downloaded Audiobooks ({downloadedBooks.length})
                  </h3>
                  {downloadedBooks.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-xs text-accent hover:underline cursor-pointer font-medium"
                    >
                      Delete All Downloads
                    </button>
                  )}
                </div>

                {isLoading ? (
                  <div className="py-12 text-center text-sm text-text-muted">
                    Loading offline storage...
                  </div>
                ) : downloadedBooks.length === 0 ? (
                  <div className="py-12 text-center border border-dashed border-border rounded-lg p-6 space-y-2">
                    <p className="text-sm text-text font-medium">
                      No offline audiobooks downloaded
                    </p>
                    <p className="text-xs text-text-muted max-w-sm mx-auto">
                      Click the download button on any book page to save it for listening on
                      flights, road trips, or without internet.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-bg">
                    {downloadedBooks.map((book) => (
                      <div
                        key={book.bookId}
                        className="p-3.5 flex items-center justify-between gap-4 hover:bg-surface/50 transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="w-10 h-14 bg-elevated border border-border rounded shrink-0 overflow-hidden flex items-center justify-center text-xs font-mono text-text-subtle">
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
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text truncate">{book.title}</p>
                            <p className="text-xs text-text-muted truncate mt-0.5">{book.author}</p>
                            <p className="text-[11px] font-mono text-text-subtle mt-1">
                              {formatBytes(book.fileSizeBytes)} • Downloaded{" "}
                              {formatDate(book.downloadedAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {onPlayBook && (
                            <button
                              type="button"
                              onClick={() => {
                                onPlayBook(book.bookId);
                                onClose();
                              }}
                              className="px-2.5 py-1 text-xs font-medium bg-elevated hover:bg-surface border border-border rounded text-text cursor-pointer transition-colors"
                            >
                              Play
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={deletingId === book.bookId}
                            onClick={() => handleDelete(book.bookId)}
                            className="px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-bg border border-border rounded cursor-pointer transition-colors disabled:opacity-50"
                          >
                            {deletingId === book.bookId ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-elevated/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium bg-surface hover:bg-elevated border border-border rounded text-text cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
