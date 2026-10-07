import type { BookProgressRecord } from "@audioneko/shared";
import type React from "react";
import { BlinkingNeko } from "../icons/NekoIcon";

interface ResumeBannerProps {
  remoteRecord: BookProgressRecord | null;
  bookTitle?: string;
  onJump: (time: number) => void;
  onDismiss: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const ResumeBanner: React.FC<ResumeBannerProps> = ({
  remoteRecord,
  bookTitle,
  onJump,
  onDismiss,
}) => {
  if (!remoteRecord) return null;

  const deviceLabel = remoteRecord.deviceName || "Another device";
  const formattedTime = formatDuration(remoteRecord.currentTime);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md bg-surface border border-border rounded-lg shadow-2xl p-3.5 flex items-center justify-between gap-3 text-sm animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        <BlinkingNeko className="w-3.5 h-3.5 text-accent shrink-0" />
        <div className="min-w-0">
          <p className="text-text font-medium truncate leading-tight">Resumed on {deviceLabel}</p>
          <p className="text-xs text-text-muted truncate mt-0.5">
            {bookTitle ? `${bookTitle} • ` : ""}Jump to{" "}
            <span className="font-mono text-accent font-medium">{formattedTime}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onJump(remoteRecord.currentTime)}
          className="px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded hover:opacity-90 active:scale-95 transition-all shadow-sm cursor-pointer"
        >
          Jump
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 text-text-muted hover:text-text rounded transition-colors cursor-pointer"
          aria-label="Dismiss resume prompt"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};
