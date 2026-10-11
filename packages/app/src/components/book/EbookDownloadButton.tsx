import type { Book } from "@audioneko/shared";
import { Link } from "@tanstack/react-router";
import { BookOpen, Download, Glasses } from "lucide-react";

interface EbookDownloadButtonProps {
  book: Book;
  className?: string;
  showReaderLink?: boolean;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EbookDownloadButton({
  book,
  className = "",
  showReaderLink = true,
}: EbookDownloadButtonProps) {
  if (!book.ebookDriveFileId) {
    return null;
  }

  const format = (book.ebookFormat || "epub").toUpperCase();
  const sizeString = formatBytes(book.ebookSizeBytes);
  const downloadUrl = `/api/books/${book.id}/ebook?download=true`;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* 1. Direct Download Anchor */}
      <a
        href={downloadUrl}
        download={
          book.ebookFileName || `${book.title} - ${book.author}.${book.ebookFormat || "epub"}`
        }
        className="px-3.5 sm:px-4 py-2.5 rounded border border-border bg-surface text-muted hover:text-text hover:border-accent/40 font-mono text-xs flex items-center gap-2 transition-colors cursor-pointer group shadow-xs"
        title={`Download companion ${format} (${sizeString})`}
      >
        <BookOpen className="w-3.5 h-3.5 text-accent group-hover:scale-105 transition-transform" />
        <span className="font-medium text-text">Download {format}</span>
        <span className="text-[10px] text-subtle font-mono">({sizeString})</span>
        <Download className="w-3 h-3 text-subtle group-hover:text-text transition-colors ml-0.5" />
      </a>

      {/* 2. In-App Immersion Reading Route Link */}
      {showReaderLink && (
        <Link
          to="/book/$id/read"
          params={{ id: book.id }}
          className="px-3 sm:px-3.5 py-2.5 rounded border border-border bg-surface text-muted hover:text-text hover:border-accent/40 font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          title="Open Immersion Reading mode (full text synchronized with audio)"
        >
          <Glasses className="w-3.5 h-3.5 text-accent" />
          <span>Read Along</span>
        </Link>
      )}
    </div>
  );
}
