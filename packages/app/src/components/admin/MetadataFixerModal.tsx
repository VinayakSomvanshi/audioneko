/**
 * audioneko: Audio Track & Audiobook Metadata Fixer Modal
 * Allows administrators to fix missing, corrupted, or incorrect ID3/M4B tags directly in the database.
 */

import { AlertCircle, Check, Edit3, Loader2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { getBookCoverUrl } from "../../lib/covers";

export interface EditableBookMetadata {
  id: string;
  title: string;
  author: string;
  narrator?: string | null;
  seriesId?: string | null;
  seriesName?: string | null;
  seriesIndex?: number | null;
  description?: string | null;
  publishedYear?: number | null;
  format?: string | null;
  driveFolderId?: string;
  coverR2Key?: string | null;
  durationSeconds?: number;
}

interface MetadataFixerModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: EditableBookMetadata | null;
  onSuccess: (updatedBook: EditableBookMetadata) => void;
}

export function MetadataFixerModal({ isOpen, onClose, book, onSuccess }: MetadataFixerModalProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [narrator, setNarrator] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [seriesIndex, setSeriesIndex] = useState<string>("");
  const [publishedYear, setPublishedYear] = useState<string>("");
  const [format, setFormat] = useState<string>("m4b");
  const [description, setDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState(false);

  useEffect(() => {
    if (book && isOpen) {
      setTitle(book.title || "");
      setAuthor(book.author || "");
      setNarrator(book.narrator || "");
      setSeriesName(book.seriesName || "");
      setSeriesIndex(book.seriesIndex != null ? String(book.seriesIndex) : "");
      setPublishedYear(book.publishedYear != null ? String(book.publishedYear) : "");
      setFormat(book.format || "m4b");
      setDescription(book.description || "");
      setErrorMsg(null);
      setSuccessNotice(false);
    }
  }, [book, isOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, saving]);

  if (!isOpen || !book) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) {
      setErrorMsg("Title and Author cannot be empty.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessNotice(false);

    try {
      const payload = {
        title: title.trim(),
        author: author.trim(),
        narrator: narrator.trim() || null,
        seriesName: seriesName.trim() || null,
        seriesIndex: seriesIndex ? Number.parseFloat(seriesIndex) : null,
        publishedYear: publishedYear ? Number.parseInt(publishedYear, 10) : null,
        format: format as "m4b" | "mp3" | "m4a" | "flac" | "opus",
        description: description.trim() || null,
      };

      const res = await fetch(`/api/admin/books/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        success?: boolean;
        book?: EditableBookMetadata;
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to update audiobook metadata.");
      }

      setSuccessNotice(true);
      if (data.book) {
        onSuccess(data.book);
      }
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save metadata updates.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-bg/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={() => {
        if (!saving) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !saving) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl surface-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-bg/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent-bg border border-accent/30 text-accent">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-text">
                Audiobook Metadata Fixer
              </h3>
              <p className="text-[11px] font-mono text-muted">
                Directly patch ID3 / catalog tags in Cloudflare D1
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-2.5 rounded bg-rose-950/30 border border-rose-800/40 text-rose-400 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-800/40 text-emerald-400 text-xs font-mono flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>Metadata updated successfully. Refreshing catalog...</span>
            </div>
          )}

          {/* Quick Book Preview Header */}
          <div className="flex items-center gap-3.5 p-3 rounded-lg bg-elevated border border-border">
            <img
              src={getBookCoverUrl(book)}
              alt={book.title}
              className="w-12 h-16 rounded object-cover border border-border shrink-0 bg-surface"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="min-w-0 flex-1 space-y-0.5 text-xs font-mono">
              <p className="text-text font-bold truncate">{book.title}</p>
              <p className="text-muted truncate">By {book.author}</p>
              <div className="flex items-center gap-2 text-[10px] text-subtle pt-0.5">
                <span>Format: {book.format?.toUpperCase()}</span>
                {book.driveFolderId && (
                  <span className="truncate max-w-[180px]">Folder: {book.driveFolderId}</span>
                )}
              </div>
            </div>
          </div>

          {/* Title & Author */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="meta-title" className="block text-xs font-mono text-muted">
                Book Title *
              </label>
              <input
                id="meta-title"
                type="text"
                required
                disabled={saving}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title of audiobook"
                className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded border border-border"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="meta-author" className="block text-xs font-mono text-muted">
                Author Name *
              </label>
              <input
                id="meta-author"
                type="text"
                required
                disabled={saving}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author (First Last)"
                className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded border border-border"
              />
            </div>
          </div>

          {/* Narrator & Format */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="meta-narrator" className="block text-xs font-mono text-muted">
                Narrator
              </label>
              <input
                id="meta-narrator"
                type="text"
                disabled={saving}
                value={narrator}
                onChange={(e) => setNarrator(e.target.value)}
                placeholder="Voice narrator"
                className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded border border-border"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="meta-format" className="block text-xs font-mono text-muted">
                Audio Container Format
              </label>
              <select
                id="meta-format"
                disabled={saving}
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono surface-card text-text focus:border-accent outline-none rounded border border-border"
              >
                <option value="m4b">M4B (Apple Audiobook / Chapters)</option>
                <option value="mp3">MP3 (MPEG-1 Audio Layer 3)</option>
                <option value="m4a">M4A (MPEG-4 Audio)</option>
                <option value="flac">FLAC (Free Lossless Audio Codec)</option>
                <option value="opus">OPUS (Ogg Opus Voice)</option>
              </select>
            </div>
          </div>

          {/* Series & Index */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label htmlFor="meta-series" className="block text-xs font-mono text-muted">
                Series Name
              </label>
              <input
                id="meta-series"
                type="text"
                disabled={saving}
                value={seriesName}
                onChange={(e) => setSeriesName(e.target.value)}
                placeholder="e.g. A Court of Thorns and Roses"
                className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded border border-border"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="meta-series-index" className="block text-xs font-mono text-muted">
                Series Number (#)
              </label>
              <input
                id="meta-series-index"
                type="number"
                step="0.1"
                disabled={saving}
                value={seriesIndex}
                onChange={(e) => setSeriesIndex(e.target.value)}
                placeholder="e.g. 1, 2, 2.5"
                className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded border border-border"
              />
            </div>
          </div>

          {/* Published Year */}
          <div className="space-y-1">
            <label htmlFor="meta-year" className="block text-xs font-mono text-muted">
              Published Year
            </label>
            <input
              id="meta-year"
              type="number"
              disabled={saving}
              value={publishedYear}
              onChange={(e) => setPublishedYear(e.target.value)}
              placeholder="e.g. 2024"
              className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded border border-border"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label htmlFor="meta-desc" className="block text-xs font-mono text-muted">
              Book Synopsis & Description
            </label>
            <textarea
              id="meta-desc"
              rows={3}
              disabled={saving}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Audiobook synopsis, blurb, or plot overview..."
              className="w-full px-3 py-2 text-xs font-mono surface-card text-text placeholder:text-muted/60 focus:border-accent outline-none rounded border border-border resize-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-mono text-muted hover:text-text rounded transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-accent text-bg font-mono font-bold text-xs rounded hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Metadata</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
