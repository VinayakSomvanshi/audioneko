import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  type DownloadProgress,
  type OfflineBookMeta,
  deleteDownloadedBook,
  downloadBookToOpfs,
  isBookDownloaded,
  isOpfsSupported,
} from "../../lib/opfs";

interface DownloadButtonProps {
  meta: OfflineBookMeta;
  onDownloadedChange?: (downloaded: boolean) => void;
  className?: string;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  meta,
  onDownloadedChange,
  className = "",
}) => {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const supported = isOpfsSupported();

  useEffect(() => {
    let mounted = true;
    if (supported && meta.bookId) {
      isBookDownloaded(meta.bookId).then((downloaded) => {
        if (mounted) {
          setIsDownloaded(downloaded);
          onDownloadedChange?.(downloaded);
        }
      });
    }
    return () => {
      mounted = false;
    };
  }, [supported, meta.bookId, onDownloadedChange]);

  if (!supported) return null;

  const handleDownload = async () => {
    if (isDownloading) {
      // Cancel active download
      abortControllerRef.current?.abort();
      setIsDownloading(false);
      setProgress(0);
      return;
    }

    if (isDownloaded) {
      // Remove downloaded book
      await deleteDownloadedBook(meta.bookId);
      setIsDownloaded(false);
      onDownloadedChange?.(false);
      return;
    }

    setIsDownloading(true);
    setProgress(0);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await downloadBookToOpfs(meta, {
        signal: controller.signal,
        onProgress: (p: DownloadProgress) => {
          setProgress(p.progressPercent);
        },
      });
      setIsDownloaded(true);
      onDownloadedChange?.(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled
      } else {
        const msg = err instanceof Error ? err.message : "Download failed";
        setError(msg);
      }
    } finally {
      setIsDownloading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className={`relative inline-flex flex-col items-start ${className}`}>
      <button
        type="button"
        onClick={handleDownload}
        className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
          isDownloaded
            ? "bg-accent-bg border-accent/40 text-accent hover:bg-accent/20"
            : isDownloading
              ? "bg-elevated border-accent text-text"
              : "bg-surface hover:bg-elevated border-border text-text"
        }`}
        title={
          isDownloaded
            ? "Downloaded offline — click to remove"
            : isDownloading
              ? `Downloading (${progress}%) — click to cancel`
              : "Download for offline listening"
        }
      >
        {isDownloaded ? (
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
            <div className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <span className="font-mono">{progress}%</span>
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

      {error && (
        <span className="text-[10px] text-accent mt-1 max-w-[140px] truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
};
