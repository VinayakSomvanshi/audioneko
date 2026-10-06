/**
 * audioneko: Quote Card & Highlight Generator
 * Generates aesthetic typography cards for audiobook quotes and bookmarks.
 * Supports HTML5 canvas rendering for PNG download and clipboard copying.
 */

import { Check, Copy, Download, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface QuoteCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookTitle: string;
  bookAuthor: string;
  chapterTitle?: string;
  positionSeconds: number;
  initialQuote?: string;
}

type CardTheme = "obsidian" | "crimson" | "slate";

function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function QuoteCardModal({
  isOpen,
  onClose,
  bookTitle,
  bookAuthor,
  chapterTitle,
  positionSeconds,
  initialQuote = "",
}: QuoteCardModalProps) {
  const [quote, setQuote] = useState(initialQuote);
  const [theme, setTheme] = useState<CardTheme>("obsidian");
  const [copiedText, setCopiedText] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setQuote(initialQuote);
  }, [initialQuote]);

  if (!isOpen) return null;

  const timecode = formatTimestamp(positionSeconds);

  const handleCopyText = async () => {
    const text = `"${quote || "Audiobook highlight"}"\n— ${bookAuthor}, ${bookTitle}${chapterTitle ? ` (${chapterTitle})` : ""} [${timecode}]`;
    await navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set high resolution dimensions (1200 x 675 for 16:9 ratio)
    canvas.width = 1200;
    canvas.height = 675;

    // Background based on theme
    if (theme === "obsidian") {
      ctx.fillStyle = "#0c0d0e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Subtle gradient highlight
      const grad = ctx.createRadialGradient(600, 200, 10, 600, 200, 600);
      grad.addColorStop(0, "rgba(224, 72, 56, 0.12)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (theme === "crimson") {
      ctx.fillStyle = "#160b0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const grad = ctx.createLinearGradient(0, 0, 1200, 675);
      grad.addColorStop(0, "#230e0c");
      grad.addColorStop(1, "#120807");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#181a1b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Border
    ctx.strokeStyle = theme === "crimson" ? "rgba(224, 72, 56, 0.4)" : "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, canvas.width - 64, canvas.height - 64);

    // Decorative Quotation Mark
    ctx.fillStyle = "rgba(224, 72, 56, 0.3)";
    ctx.font = "italic 140px Georgia, serif";
    ctx.fillText("“", 90, 180);

    // Quote text (word wrapped)
    ctx.fillStyle = "#f5f5f5";
    ctx.font = "34px Georgia, serif";
    const maxWidth = 1000;
    const lineHeight = 52;
    const words = (quote || "Audiobook bookmark and highlight").split(" ");
    let line = "";
    let y = 220;

    for (let n = 0; n < words.length; n++) {
      const testLine = `${line + words[n]} `;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, 100, y);
        line = `${words[n]} `;
        y += lineHeight;
        if (y > 480) {
          line += "...";
          break;
        }
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, 100, y);

    // Book & Author Details
    ctx.fillStyle = "#e04838";
    ctx.font = "bold 24px monospace";
    ctx.fillText(`${bookAuthor.toUpperCase()}`, 100, 560);

    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "22px sans-serif";
    ctx.fillText(`${bookTitle}${chapterTitle ? ` • ${chapterTitle}` : ""} • ${timecode}`, 100, 595);

    // Watermark
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.font = "18px monospace";
    ctx.fillText("audioneko", 1020, 595);

    // Download trigger
    const link = document.createElement("a");
    link.download = `quote-${bookTitle.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="surface-card border border-border w-full max-w-2xl rounded-xl p-6 space-y-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-text font-bold text-base">
            <Sparkles className="w-5 h-5 text-accent" />
            <span>Generate Quote Card</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-text p-1 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quote Input */}
        <div className="space-y-1.5">
          <label
            htmlFor="quote-text-input"
            className="text-xs font-mono text-subtle uppercase tracking-wider"
          >
            Quote / Annotation Text
          </label>
          <textarea
            id="quote-text-input"
            rows={3}
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="Type or paste the passage or reflection here..."
            className="w-full bg-surface border border-border rounded-lg p-3 text-sm text-text focus:outline-none focus:border-accent font-sans"
          />
        </div>

        {/* Theme Selectors */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted mr-1">Theme:</span>
          {(["obsidian", "crimson", "slate"] as CardTheme[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`px-3 py-1 rounded text-xs font-mono capitalize border transition-colors cursor-pointer ${
                theme === t
                  ? "border-accent bg-accent/20 text-accent font-semibold"
                  : "border-border bg-surface text-muted hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Live Card Preview */}
        <div
          ref={cardRef}
          className={`p-6 sm:p-8 rounded-xl border relative overflow-hidden transition-all shadow-lg ${
            theme === "obsidian"
              ? "bg-[#0c0d0e] border-border text-text"
              : theme === "crimson"
                ? "bg-[#180b09] border-accent/40 text-text"
                : "bg-surface border-border text-text"
          }`}
        >
          <div className="text-4xl sm:text-5xl font-serif text-accent/40 leading-none select-none">
            “
          </div>
          <p className="text-base sm:text-lg font-serif italic text-text/95 leading-relaxed mt-1 mb-6">
            {quote || "Audiobook highlight and annotation"}
          </p>
          <div className="flex items-center justify-between border-t border-border/50 pt-3">
            <div>
              <div className="text-xs font-mono font-bold text-accent uppercase tracking-wider">
                {bookAuthor}
              </div>
              <div className="text-[11px] font-mono text-muted mt-0.5">
                {bookTitle} {chapterTitle ? `• ${chapterTitle}` : ""} • {timecode}
              </div>
            </div>
            <div className="text-[10px] font-mono text-subtle tracking-widest uppercase">
              audioneko
            </div>
          </div>
        </div>

        {/* Hidden Canvas for High-Res PNG Rendering */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleCopyText}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono border border-border bg-surface hover:text-text text-muted transition-colors cursor-pointer"
          >
            {copiedText ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
            <span>{copiedText ? "Copied" : "Copy Text"}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadImage}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono bg-accent hover:bg-accent-hover text-white font-medium transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
}
