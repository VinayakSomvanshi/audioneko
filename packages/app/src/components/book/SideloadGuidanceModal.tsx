import { BookOpen, ExternalLink, Laptop, Send, Smartphone, Usb, X } from "lucide-react";

interface SideloadGuidanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  format?: string;
  bookTitle?: string;
}

export function SideloadGuidanceModal({
  isOpen,
  onClose,
  format = "EPUB",
  bookTitle,
}: SideloadGuidanceModalProps) {
  if (!isOpen) return null;

  const upperFormat = format.toUpperCase();

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: custom accessible modal backdrop
      role="dialog"
      aria-modal="true"
      aria-labelledby="sideload-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="w-full sm:max-w-lg surface-card border-t sm:border border-border sm:rounded-xl shadow-2xl p-5 sm:p-6 space-y-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-surface border border-border">
              <BookOpen className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 id="sideload-title" className="text-sm font-semibold text-text">
                E-Reader Sideloading Guide
              </h2>
              <p className="text-[11px] font-mono text-muted">
                How to transfer {upperFormat} files to your devices
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer"
            aria-label="Close guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {bookTitle && (
          <div className="p-2.5 rounded bg-surface border border-border text-xs font-mono text-muted">
            <span className="text-subtle">File for: </span>
            <span className="text-text font-medium">{bookTitle}</span>
          </div>
        )}

        {/* Guides List */}
        <div className="space-y-4">
          {/* 1. Amazon Kindle */}
          <div className="p-3.5 rounded-lg bg-surface border border-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-accent" />
                <span className="text-xs font-semibold text-text">
                  Amazon Kindle (Paperwhite, Oasis, Scribe, App)
                </span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-elevated text-accent border border-border">
                Recommended
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Amazon natively converts and syncs EPUB files across all your Kindles using Send to
              Kindle:
            </p>
            <ol className="text-xs text-muted space-y-1.5 list-decimal list-inside font-sans">
              <li>
                <strong className="text-text">Web Upload (Fastest):</strong> Visit{" "}
                <a
                  href="https://www.amazon.com/sendtokindle"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline inline-flex items-center gap-0.5"
                >
                  amazon.com/sendtokindle
                  <ExternalLink className="w-3 h-3" />
                </a>{" "}
                and drag the downloaded file directly into your browser.
              </li>
              <li>
                <strong className="text-text">Email to Kindle:</strong> Attach the downloaded file
                to an email sent to your{" "}
                <code className="text-text font-mono text-[11px]">@kindle.com</code> delivery
                address.
              </li>
            </ol>
          </div>

          {/* 2. Kobo & Onyx Boox */}
          <div className="p-3.5 rounded-lg bg-surface border border-border space-y-2">
            <div className="flex items-center gap-2">
              <Usb className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-text">Kobo, Onyx Boox & PocketBook</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Standard USB-C drag-and-drop or direct built-in web browser:
            </p>
            <ol className="text-xs text-muted space-y-1.5 list-decimal list-inside font-sans">
              <li>
                <strong className="text-text">Via USB-C:</strong> Connect your e-reader to your
                computer. Copy the downloaded {upperFormat} into the main storage or{" "}
                <code className="text-text font-mono text-[11px]">eBooks</code> folder, then safely
                eject.
              </li>
              <li>
                <strong className="text-text">Via Device Browser:</strong> Open audioneko in your
                e-reader's experimental browser and tap Download.
              </li>
            </ol>
          </div>

          {/* 3. Apple Books */}
          <div className="p-3.5 rounded-lg bg-surface border border-border space-y-2">
            <div className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-text">
                Apple Books (iPhone, iPad & Mac)
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Tap the downloaded file in Safari or the Files app and tap{" "}
              <strong className="text-text">Open in Books</strong>. iCloud syncs it across your
              Apple devices automatically.
            </p>
          </div>

          {/* 4. Android E-Readers & Apps */}
          <div className="p-3.5 rounded-lg bg-surface border border-border space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-text">
                Android (Moon+ Reader, ReadEra, Lithium)
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Open the downloaded file from your notifications or Downloads folder, and select your
              reading app to import immediately.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded bg-surface border border-border hover:bg-elevated text-xs font-mono text-text transition-colors cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
