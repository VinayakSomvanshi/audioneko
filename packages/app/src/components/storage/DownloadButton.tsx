import type { Book } from "@audioneko/shared";
import type React from "react";
import { useEffect, useState } from "react";
import { getBookCoverUrl } from "../../lib/covers";
import { useDownloads } from "../../lib/download-manager";
import {
  type OfflineBookMeta,
  deleteDownloadedBook,
  isBookDownloaded,
  isOpfsSupported,
} from "../../lib/opfs";
import { AlertCircle } from "lucide-react";
import { BlinkingNeko, NekoIcon } from "../icons/NekoIcon";

interface DownloadButtonProps {
  meta?: OfflineBookMeta;
  book?: Book;
  onDownloadedChange?: (downloaded: boolean) => void;
  className?: string;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  meta,
  book,
  onDownloadedChange,
  className = "",
}) => {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const { getTask, enqueue, pause, resume, cancel } = useDownloads();

  const supported = isOpfsSupported();

  const bookMeta: OfflineBookMeta | null = meta
    ? meta
    : book
      ? {
          bookId: book.id,
          title: book.title,
          author: book.author,
          coverR2Key: book.coverR2Key,
          coverUrl: getBookCoverUrl(book),
          durationSeconds: book.durationSeconds,
          format: book.format,
          fileSizeBytes: book.fileSizeBytes,
          downloadedAt: Date.now(),
        }
      : null;

  const targetBookId = bookMeta?.bookId;
  const currentTask = targetBookId ? getTask(targetBookId) : undefined;

  useEffect(() => {
    let mounted = true;
    if (supported && targetBookId) {
      isBookDownloaded(targetBookId).then((downloaded) => {
        if (mounted) {
          setIsDownloaded(downloaded);
          onDownloadedChange?.(downloaded);
        }
      });
    }
    return () => {
      mounted = false;
    };
  }, [supported, targetBookId, onDownloadedChange]);

  if (!supported || !bookMeta) return null;

  const handleAction = async () => {
    if (isDownloaded) {
      // Remove downloaded book
      await deleteDownloadedBook(bookMeta.bookId);
      setIsDownloaded(false);
      onDownloadedChange?.(false);
      return;
    }

    if (currentTask) {
      if (currentTask.status === "downloading") {
        pause(bookMeta.bookId);
        return;
      }
      if (currentTask.status === "paused" || currentTask.status === "error") {
        resume(bookMeta.bookId);
        return;
      }
      if (currentTask.status === "queued") {
        await cancel(bookMeta.bookId);
        return;
      }
    }

    // Start download
    await enqueue(bookMeta);
  };

  const isDownloading = currentTask?.status === "downloading";
  const isPaused = currentTask?.status === "paused";
  const isQueued = currentTask?.status === "queued";
  const isError = currentTask?.status === "error";
  const progressPercent = currentTask?.progressPercent ?? 0;

  return (
    <div className={`relative inline-flex flex-col items-start ${className}`}>
      <button
        type="button"
        onClick={handleAction}
        className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
          isError
            ? "bg-destructive/15 border-destructive/40 text-destructive hover:bg-destructive/25"
            : isDownloaded
              ? "bg-accent-bg border-accent/40 text-accent hover:bg-accent/20"
              : isDownloading
                ? "bg-elevated border-accent text-text"
                : isPaused
                  ? "bg-elevated border-amber-500/40 text-amber-400 hover:bg-elevated/80"
                  : isQueued
                    ? "bg-surface border-border text-muted"
                    : "bg-surface hover:bg-elevated border-border text-text"
        }`}
        title={
          isError
            ? `Download failed (${currentTask?.errorMessage || "Storage/Network error"}) — click to retry`
            : isDownloaded
              ? "Downloaded offline — click to remove"
              : isDownloading
                ? `Downloading (${progressPercent}%) — click to pause`
                : isPaused
                  ? `Paused at ${progressPercent}% — click to resume`
                  : isQueued
                    ? "Queued in download manager — click to cancel"
                    : "Download for offline listening"
        }
      >
        {isError ? (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
            <span>Retry Download</span>
          </>
        ) : isDownloaded ? (
          <>
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              role="img"
              aria-label="Downloaded"
            >
              <title>Downloaded</title>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>Offline Ready</span>
          </>
        ) : isDownloading ? (
          <>
            <BlinkingNeko className="w-3.5 h-3.5 text-accent" />
            <span className="font-mono">{progressPercent}%</span>
          </>
        ) : isPaused ? (
          <>
            <NekoIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-mono text-xs">Paused ({progressPercent}%)</span>
          </>
        ) : isQueued ? (
          <>
            <BlinkingNeko className="w-3.5 h-3.5 text-muted opacity-60" />
            <span>Queued</span>
          </>
        ) : (
          <>
            <svg
              className="w-3.5 h-3.5 text-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              role="img"
              aria-label="Download"
            >
              <title>Download</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            <span>Download</span>
          </>
        )}
      </button>

      {currentTask?.errorMessage && (
        <span
          className="text-[10px] text-destructive/90 mt-1 max-w-[200px] truncate font-mono"
          title={currentTask.errorMessage}
        >
          {currentTask.errorMessage}
        </span>
      )}
    </div>
  );
};
