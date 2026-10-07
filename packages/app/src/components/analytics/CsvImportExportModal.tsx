import type { Book, BookProgressRecord } from "@audioneko/shared";
import {
  AlertCircle,
  BookCheck,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Upload,
  X,
} from "lucide-react";
import { type ChangeEvent, useState } from "react";
import {
  type ParsedCsvRecord,
  exportGoodreadsCsv,
  exportStoryGraphCsv,
  matchCsvWithLibrary,
  parseReadingCsv,
} from "../../lib/reading-csv";

interface CsvImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: Book[];
  progressMap: Record<string, BookProgressRecord>;
  onApplyMatches?: (matchedBookIds: string[]) => Promise<void>;
}

export function CsvImportExportModal({
  isOpen,
  onClose,
  books,
  progressMap,
  onApplyMatches,
}: CsvImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [parsedRecords, setParsedRecords] = useState<ParsedCsvRecord[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccessMsg, setApplySuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Compute library stats
  const finishedCount = books.filter((b) => progressMap[b.id]?.isFinished).length;
  const inProgressCount = books.filter(
    (b) => !progressMap[b.id]?.isFinished && (progressMap[b.id]?.currentTime || 0) > 60,
  ).length;

  const handleDownload = (format: "goodreads" | "storygraph") => {
    const csv =
      format === "goodreads"
        ? exportGoodreadsCsv(books, progressMap)
        : exportStoryGraphCsv(books, progressMap);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `audioneko-${format}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setApplySuccessMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const records = parseReadingCsv(text);
        setParsedRecords(records);
      }
    };
    reader.readAsText(file);
  };

  const matchResult = parsedRecords ? matchCsvWithLibrary(parsedRecords, books) : null;

  const handleSyncMatches = async () => {
    if (!matchResult || !onApplyMatches) return;
    setIsApplying(true);
    try {
      const bookIdsToMarkRead = matchResult.matched
        .filter((m) => m.record.readStatus === "read")
        .map((m) => m.book.id);

      await onApplyMatches(bookIdsToMarkRead);
      setApplySuccessMsg(
        `Successfully synced ${bookIdsToMarkRead.length} finished audiobooks to your audioneko library!`,
      );
    } catch {
      setApplySuccessMsg("Failed to sync some progress records.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: custom accessible backdrop dialog container
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="w-full sm:max-w-xl surface-card border-t sm:border border-border sm:rounded-xl shadow-2xl p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 id="csv-modal-title" className="text-base font-semibold text-text tracking-tight">
                StoryGraph & Goodreads Sync
              </h2>
              <p className="text-xs font-mono text-muted">
                Import & export audiobook history via standard CSV
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-text rounded-md hover:bg-elevated transition-colors cursor-pointer"
            aria-label="Close CSV Dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab("export")}
            className={`pb-2 px-4 transition-colors border-b-2 cursor-pointer ${
              activeTab === "export"
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("import")}
            className={`pb-2 px-4 transition-colors border-b-2 cursor-pointer ${
              activeTab === "import"
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            Import CSV
          </button>
        </div>

        {/* Export Tab */}
        {activeTab === "export" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-surface border border-border text-center font-mono text-xs">
              <div>
                <div className="text-base font-bold text-text">{books.length}</div>
                <div className="text-[10px] text-muted">Total Audiobooks</div>
              </div>
              <div>
                <div className="text-base font-bold text-accent">{finishedCount}</div>
                <div className="text-[10px] text-muted">Finished</div>
              </div>
              <div>
                <div className="text-base font-bold text-text">{inProgressCount}</div>
                <div className="text-[10px] text-muted">In Progress</div>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Export your personal audiobook reading log into format-compatible CSV files. You can
              upload these directly to StoryGraph or Goodreads without manual entry.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleDownload("storygraph")}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border bg-surface hover:border-accent hover:bg-elevated text-xs font-mono font-medium transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-accent" />
                <span>StoryGraph CSV</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownload("goodreads")}
                className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border bg-surface hover:border-accent hover:bg-elevated text-xs font-mono font-medium transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-accent" />
                <span>Goodreads CSV</span>
              </button>
            </div>
          </div>
        )}

        {/* Import Tab */}
        {activeTab === "import" && (
          <div className="space-y-4">
            <p className="text-xs text-muted leading-relaxed">
              Upload your exported Goodreads or StoryGraph library CSV. audioneko will cross-match
              titles against your Google Drive library to sync completed books and track wishlists.
            </p>

            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-accent/60 transition-colors bg-surface/50">
              <input
                type="file"
                accept=".csv"
                id="csv-file-input"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="csv-file-input"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="w-8 h-8 text-accent/80" />
                <span className="text-xs font-mono font-semibold text-text">
                  {fileName ? fileName : "Click to select Goodreads / StoryGraph CSV"}
                </span>
                <span className="text-[11px] text-muted font-mono">
                  Standard RFC 4180 CSV export files supported
                </span>
              </label>
            </div>

            {applySuccessMsg && (
              <div className="p-3 rounded-lg bg-green-950/30 border border-green-800/40 text-green-300 text-xs font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                <span>{applySuccessMsg}</span>
              </div>
            )}

            {matchResult && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-text font-semibold">
                    Match Analysis ({matchResult.matched.length} matched /{" "}
                    {matchResult.unmatchedRecords.length} wishlist items)
                  </span>
                  <span className="text-accent uppercase">
                    {parsedRecords?.[0]?.source || "CSV"}
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-surface border border-border text-xs font-mono">
                  {matchResult.matched.map(({ book, record }) => (
                    <div
                      key={book.id}
                      className="flex items-center justify-between p-1.5 rounded bg-elevated/50"
                    >
                      <div className="truncate pr-2">
                        <span className="font-semibold text-text">{book.title}</span>
                        <span className="text-muted text-[10px] ml-1.5">by {book.author}</span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold shrink-0 ${
                          record.readStatus === "read"
                            ? "bg-green-950/60 text-green-400 border border-green-800/40"
                            : "bg-surface text-muted border border-border"
                        }`}
                      >
                        {record.readStatus}
                      </span>
                    </div>
                  ))}
                </div>

                {onApplyMatches && matchResult.matched.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSyncMatches}
                    disabled={isApplying}
                    className="w-full py-2.5 rounded-lg bg-accent text-bg font-semibold text-xs font-mono hover:bg-accent-light transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <BookCheck className="w-4 h-4" />
                    <span>{isApplying ? "Syncing..." : "Sync Completed Books to Library"}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 surface-card border border-border text-text font-mono text-xs rounded-md hover:bg-elevated transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
