import type { Book } from "@audioneko/shared";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  List,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Type,
  Unlock,
  X,
} from "lucide-react";
import { type UIEvent, useEffect, useRef, useState } from "react";
import { useAudio } from "../../context/audio-context";
import { loadBookEpub } from "../../lib/epub-cache";
import { type EpubChapter, EpubParser, type EpubTocItem } from "../../lib/epub-parser";

interface ReadAlongReaderProps {
  book: Book;
  className?: string;
  isStandalone?: boolean;
}

interface TypographySettings {
  fontFamily: "serif" | "sans" | "mono";
  fontSize: number; // in px: 14 to 26
  lineHeight: number; // 1.4 to 1.8
  maxWidth: "compact" | "normal" | "wide";
}

const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontFamily: "serif",
  fontSize: 17,
  lineHeight: 1.65,
  maxWidth: "normal",
};

const STORAGE_KEY_TYPO = "audioneko_reader_typography";
const STORAGE_KEY_OFFSET_PREFIX = "audioneko_reader_offset_";

export function ReadAlongReader({
  book,
  className = "",
  isStandalone = false,
}: ReadAlongReaderProps) {
  const { currentTime, isPlaying, chapters, currentChapter, seekTo } = useAudio();

  // Parser state
  const [parser, setParser] = useState<EpubParser | null>(null);
  const [loadingPercent, setLoadingPercent] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Active chapter state
  const [activeSpineIndex, setActiveSpineIndex] = useState<number>(0);
  const [currentChapterContent, setCurrentChapterContent] = useState<EpubChapter | null>(null);

  // Chapter offset (+1, -1, 0)
  const offsetKey = `${STORAGE_KEY_OFFSET_PREFIX}${book.id}`;
  const [chapterOffset, setChapterOffset] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(offsetKey);
      return saved ? Number.parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  // Typography state
  const [typography, setTypography] = useState<TypographySettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TYPO);
      return saved ? { ...DEFAULT_TYPOGRAPHY, ...JSON.parse(saved) } : DEFAULT_TYPOGRAPHY;
    } catch {
      return DEFAULT_TYPOGRAPHY;
    }
  });

  // Modals & Panels
  const [showTocDrawer, setShowTocDrawer] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<number>(0);

  // Auto-scroll & Scroll Lock state
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [isScrollLocked, setIsScrollLocked] = useState(false);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const lastProgrammaticScrollTop = useRef<number>(-1);
  const isInternalScrolling = useRef<boolean>(false);

  // Save typography
  const updateTypography = (updates: Partial<TypographySettings>) => {
    setTypography((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY_TYPO, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Save offset
  const updateOffset = (delta: number) => {
    setChapterOffset((prev) => {
      const next = prev + delta;
      try {
        localStorage.setItem(offsetKey, String(next));
      } catch {}
      return next;
    });
  };

  // 1. Fetch & parse EPUB on mount
  useEffect(() => {
    let isCancelled = false;
    let activeParser: EpubParser | null = null;

    setIsLoading(true);
    setLoadError(null);
    setLoadingPercent(5);

    loadBookEpub(book.id, (pct) => {
      if (!isCancelled) setLoadingPercent(pct);
    })
      .then((arrayBuffer) => {
        if (isCancelled) return;
        activeParser = new EpubParser(arrayBuffer);
        setParser(activeParser);
        setIsLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error("Failed to parse EPUB:", err);
        setLoadError(err instanceof Error ? err.message : "Failed to load companion e-book.");
        setIsLoading(false);
      });

    return () => {
      isCancelled = true;
      if (activeParser) {
        activeParser.destroy();
      }
    };
  }, [book.id]);

  // 2. Synchronize Audio Chapter to Reader Spine Index (Tier 1 Sync)
  useEffect(() => {
    if (!parser || parser.spineCount === 0 || chapters.length === 0) return;

    // Find index of current audio chapter
    const audioChapterIndex = currentChapter
      ? chapters.findIndex((c) => c.id === currentChapter.id)
      : 0;

    if (audioChapterIndex < 0) return;

    // Calculate effective spine index with manual offset
    const effectiveIndex = Math.max(
      0,
      Math.min(parser.spineCount - 1, audioChapterIndex + chapterOffset),
    );

    if (effectiveIndex !== activeSpineIndex) {
      setActiveSpineIndex(effectiveIndex);
      // Reset scroll lock when chapter changes
      setIsScrollLocked(false);
    }
  }, [currentChapter, chapters, parser, chapterOffset, activeSpineIndex]);

  // 3. Load active chapter content when activeSpineIndex changes
  useEffect(() => {
    if (!parser || parser.spineCount === 0) return;
    try {
      const ch = parser.getChapter(activeSpineIndex);
      setCurrentChapterContent(ch);
      if (textContainerRef.current) {
        textContainerRef.current.scrollTop = 0;
      }
    } catch (err) {
      console.error(`Failed to load spine chapter ${activeSpineIndex}:`, err);
    }
  }, [parser, activeSpineIndex]);

  // 4. Proportional Interpolated Auto-Scroll (Tier 2 Sync)
  useEffect(() => {
    if (!isAutoScrollEnabled || isScrollLocked || !isPlaying || !currentChapter) return;
    const container = textContainerRef.current;
    if (!container) return;

    const chStart = currentChapter.startTime ?? 0;
    const chEnd = currentChapter.endTime ?? chStart + 1;
    const chDuration = chEnd - chStart;

    if (chDuration <= 0) return;

    const chElapsed = Math.max(0, currentTime - chStart);
    const progressFraction = Math.min(1, Math.max(0, chElapsed / chDuration));

    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) return;

    const targetScrollTop = progressFraction * maxScroll;

    // Only scroll if difference is noticeable (> 6px) to avoid jitter
    if (Math.abs(container.scrollTop - targetScrollTop) > 6) {
      isInternalScrolling.current = true;
      lastProgrammaticScrollTop.current = targetScrollTop;
      container.scrollTo({
        top: targetScrollTop,
        behavior: "smooth",
      });
      // Clear programmatic scrolling lock flag shortly after smooth scroll starts
      setTimeout(() => {
        isInternalScrolling.current = false;
      }, 350);
    }
  }, [currentTime, currentChapter, isPlaying, isAutoScrollEnabled, isScrollLocked]);

  // 5. Handle manual scroll (engage Scroll Lock)
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    if (isInternalScrolling.current) return;
    const target = e.currentTarget;
    if (Math.abs(target.scrollTop - lastProgrammaticScrollTop.current) > 20) {
      if (!isScrollLocked) {
        setIsScrollLocked(true);
      }
    }
  };

  // Re-snap to audio position
  const handleSnapToAudio = () => {
    setIsScrollLocked(false);
    const container = textContainerRef.current;
    if (!container || !currentChapter) return;

    const chStart = currentChapter.startTime ?? 0;
    const chEnd = currentChapter.endTime ?? chStart + 1;
    const chDuration = chEnd - chStart;
    if (chDuration <= 0) return;

    const fraction = Math.min(1, Math.max(0, (currentTime - chStart) / chDuration));
    const maxScroll = container.scrollHeight - container.clientHeight;
    const targetTop = fraction * maxScroll;

    isInternalScrolling.current = true;
    lastProgrammaticScrollTop.current = targetTop;
    container.scrollTo({ top: targetTop, behavior: "smooth" });
    setTimeout(() => {
      isInternalScrolling.current = false;
    }, 400);
  };

  // Jump to specific TOC item and seek audio
  const handleSelectTocItem = (tocItem: EpubTocItem) => {
    setActiveSpineIndex(tocItem.spineIndex);
    setShowTocDrawer(false);
    setIsScrollLocked(false);

    // Also seek corresponding audio chapter if chapter aligns
    const matchingAudioChapterIndex = tocItem.spineIndex - chapterOffset;
    if (matchingAudioChapterIndex >= 0 && matchingAudioChapterIndex < chapters.length) {
      const audioCh = chapters[matchingAudioChapterIndex];
      if (audioCh && audioCh.startTime != null) {
        seekTo(audioCh.startTime);
      }
    }
  };

  // In-chapter search execution
  useEffect(() => {
    if (!searchQuery.trim() || !textContainerRef.current) {
      setSearchMatches(0);
      return;
    }
    const container = textContainerRef.current;
    const text = container.textContent || "";
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = (text.match(regex) || []).length;
    setSearchMatches(matches);
  }, [searchQuery]);

  // Typography CSS classes
  const fontClass =
    typography.fontFamily === "serif"
      ? "font-serif"
      : typography.fontFamily === "mono"
        ? "font-mono"
        : "font-sans";

  const maxWidthClass =
    typography.maxWidth === "compact"
      ? "max-w-[540px]"
      : typography.maxWidth === "wide"
        ? "max-w-[820px]"
        : "max-w-[680px]";

  // Format MM:SS helper
  const formatSecondsShort = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  if (isLoading) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 space-y-4 text-center ${className}`}
      >
        <div className="p-3 rounded-full bg-surface border border-border animate-pulse">
          <BookOpen className="w-8 h-8 text-accent" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-mono text-text font-medium">Unpacking Companion E-Book...</p>
          <p className="text-[11px] font-mono text-muted">
            {loadingPercent > 0
              ? `${loadingPercent}% decompressed in browser`
              : "Streaming from edge vault"}
          </p>
        </div>
        <div className="w-48 h-1.5 bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-200"
            style={{ width: `${Math.max(10, loadingPercent)}%` }}
          />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className={`p-6 surface-card border border-border rounded-lg text-center space-y-3 ${className}`}
      >
        <BookOpen className="w-8 h-8 text-muted mx-auto" />
        <p className="text-xs font-mono text-text font-medium">Could not load reader</p>
        <p className="text-[11px] font-mono text-muted">{loadError}</p>
        <a
          href={`/api/books/${book.id}/ebook`}
          download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface border border-border text-xs font-mono text-accent hover:border-accent/40 transition-colors"
        >
          Download EPUB directly
        </a>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col h-full bg-bg text-text select-text ${isStandalone ? "w-full" : ""} ${className}`}
    >
      {/* 1. Reader Toolbar */}
      <header className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-border bg-surface shrink-0 z-20">
        {/* Left: Table of Contents & Spine Jump */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setShowTocDrawer(true)}
            className="px-2.5 py-1.5 rounded border border-border bg-elevated hover:bg-surface text-muted hover:text-text font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Open Table of Contents"
          >
            <List className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">Contents</span>
          </button>

          {/* Current Chapter Title & spine counter */}
          <div className="truncate text-xs font-mono text-muted pl-1">
            <span className="text-text font-medium truncate">
              {currentChapterContent?.title || `Chapter ${activeSpineIndex + 1}`}
            </span>
            {parser && (
              <span className="text-[10px] text-subtle ml-1.5 hidden md:inline">
                ({activeSpineIndex + 1}/{parser.spineCount})
              </span>
            )}
          </div>
        </div>

        {/* Right Controls: Offset, Search, Typography, Auto-Scroll toggle */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Manual Chapter Offset Selector */}
          <div className="hidden sm:flex items-center rounded border border-border bg-elevated p-0.5 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => updateOffset(-1)}
              className="px-1.5 py-0.5 rounded text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
              title="Shift reader sync back 1 chapter"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span
              className={`px-1.5 py-0.5 ${chapterOffset !== 0 ? "text-accent font-bold" : "text-subtle"}`}
              title="Manual chapter offset between audio and print"
            >
              {chapterOffset >= 0 ? `+${chapterOffset}` : chapterOffset}
            </span>
            <button
              type="button"
              onClick={() => updateOffset(1)}
              className="px-1.5 py-0.5 rounded text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
              title="Shift reader sync forward 1 chapter"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Search toggle */}
          <button
            type="button"
            onClick={() => setShowSearchBar(!showSearchBar)}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              showSearchBar
                ? "bg-accent/20 text-accent border border-accent/40"
                : "text-muted hover:text-text hover:bg-elevated"
            }`}
            title="Search in current chapter"
            aria-label="Search chapter"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Typography Settings toggle */}
          <button
            type="button"
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              showSettingsMenu
                ? "bg-accent/20 text-accent border border-accent/40"
                : "text-muted hover:text-text hover:bg-elevated"
            }`}
            title="Typography & Appearance"
            aria-label="Typography settings"
          >
            <Type className="w-3.5 h-3.5" />
          </button>

          {/* Auto-Scroll Toggle */}
          <button
            type="button"
            onClick={() => setIsAutoScrollEnabled(!isAutoScrollEnabled)}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              isAutoScrollEnabled
                ? "text-muted hover:text-text hover:bg-elevated"
                : "bg-elevated text-subtle border border-border"
            }`}
            title={
              isAutoScrollEnabled
                ? "Auto-scroll ON (click to pause)"
                : "Auto-scroll OFF (click to enable)"
            }
            aria-label="Toggle auto-scroll"
          >
            {isAutoScrollEnabled ? (
              <Unlock className="w-3.5 h-3.5 text-accent" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-subtle" />
            )}
          </button>
        </div>
      </header>

      {/* 2. In-Chapter Search Bar */}
      {showSearchBar && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-elevated text-xs font-mono animate-in fade-in">
          <Search className="w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search words or character names in this chapter..."
            className="flex-1 bg-transparent border-none text-text placeholder:text-muted/60 focus:outline-none text-xs"
          />
          {searchQuery && (
            <span className="text-[10px] text-accent font-mono px-1.5 py-0.5 rounded bg-surface border border-border">
              {searchMatches} match{searchMatches === 1 ? "" : "es"}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setShowSearchBar(false);
            }}
            className="p-1 rounded text-muted hover:text-text cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. Typography Settings Flyout Menu */}
      {showSettingsMenu && (
        <div className="absolute top-10 right-3 z-30 w-72 surface-card border border-border rounded-xl shadow-2xl p-4 space-y-4 text-xs font-mono animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="font-semibold text-text">Typography</span>
            <button
              type="button"
              onClick={() => setShowSettingsMenu(false)}
              className="p-1 rounded text-muted hover:text-text cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Font Family */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted block">Typeface</span>
            <div className="grid grid-cols-3 gap-1">
              {(["serif", "sans", "mono"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => updateTypography({ fontFamily: f })}
                  className={`px-2 py-1.5 rounded text-center transition-colors cursor-pointer border ${
                    typography.fontFamily === f
                      ? "border-accent bg-accent/15 text-accent font-bold"
                      : "border-border bg-elevated text-muted hover:text-text"
                  }`}
                >
                  {f === "serif" ? "Serif" : f === "sans" ? "Sans" : "Mono"}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-muted">
              <span>Font Size</span>
              <span className="text-text">{typography.fontSize}px</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  updateTypography({ fontSize: Math.max(14, typography.fontSize - 1) })
                }
                className="p-1.5 rounded border border-border bg-elevated hover:bg-surface cursor-pointer text-muted hover:text-text"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={14}
                max={26}
                value={typography.fontSize}
                onChange={(e) => updateTypography({ fontSize: Number(e.target.value) })}
                className="flex-1 accent-accent cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  updateTypography({ fontSize: Math.min(26, typography.fontSize + 1) })
                }
                className="p-1.5 rounded border border-border bg-elevated hover:bg-surface cursor-pointer text-muted hover:text-text"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Line Height */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted block">Line Spacing</span>
            <div className="grid grid-cols-3 gap-1">
              {[
                { val: 1.45, label: "Compact" },
                { val: 1.65, label: "Normal" },
                { val: 1.85, label: "Relaxed" },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => updateTypography({ lineHeight: val })}
                  className={`px-2 py-1 rounded text-center transition-colors cursor-pointer border ${
                    Math.abs(typography.lineHeight - val) < 0.05
                      ? "border-accent bg-accent/15 text-accent font-bold"
                      : "border-border bg-elevated text-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Column Width */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted block">Reading Column</span>
            <div className="grid grid-cols-3 gap-1">
              {(["compact", "normal", "wide"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => updateTypography({ maxWidth: w })}
                  className={`px-2 py-1 rounded text-center transition-colors cursor-pointer border ${
                    typography.maxWidth === w
                      ? "border-accent bg-accent/15 text-accent font-bold"
                      : "border-border bg-elevated text-muted hover:text-text"
                  }`}
                >
                  {w.charAt(0).toUpperCase() + w.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Reset button */}
          <button
            type="button"
            onClick={() => setTypography(DEFAULT_TYPOGRAPHY)}
            className="w-full py-1 text-center text-[10px] text-subtle hover:text-muted cursor-pointer"
          >
            Reset to defaults
          </button>
        </div>
      )}

      {/* 4. Table of Contents Slide-Out Drawer */}
      {showTocDrawer && parser && (
        <div
          // biome-ignore lint/a11y/useSemanticElements: custom accessible drawer overlay backdrop
          role="dialog"
          aria-modal="true"
          className="absolute inset-0 z-40 bg-black/80 backdrop-blur-xs flex"
          onClick={() => setShowTocDrawer(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowTocDrawer(false)}
        >
          <div
            className="w-full max-w-xs h-full bg-surface border-r border-border p-4 flex flex-col space-y-4 animate-in slide-in-from-left duration-200"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4 text-accent" />
                <h3 className="text-xs font-mono font-semibold text-text">Table of Contents</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTocDrawer(false)}
                className="p-1 rounded text-muted hover:text-text cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 font-mono text-xs">
              {parser.toc.map((item, index) => {
                const isActive = item.spineIndex === activeSpineIndex;
                return (
                  <button
                    key={item.id || index}
                    type="button"
                    onClick={() => handleSelectTocItem(item)}
                    className={`w-full text-left px-3 py-2 rounded transition-colors cursor-pointer flex items-center justify-between group ${
                      isActive
                        ? "bg-accent text-bg font-semibold"
                        : "hover:bg-elevated text-muted hover:text-text"
                    }`}
                  >
                    <span className="truncate pr-2">{item.title}</span>
                    <span
                      className={`text-[10px] shrink-0 ${
                        isActive ? "text-bg/75" : "text-subtle group-hover:text-muted"
                      }`}
                    >
                      {item.spineIndex + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 5. Main Reader Viewport with Clean Obsidian Typography */}
      <div
        ref={textContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-10 overscroll-contain"
      >
        <div
          className={`mx-auto ${maxWidthClass} space-y-4 ${fontClass} leading-relaxed transition-all`}
          style={{
            fontSize: `${typography.fontSize}px`,
            lineHeight: typography.lineHeight,
          }}
        >
          {/* Chapter Heading Banner */}
          {currentChapterContent && (
            <div className="pb-4 mb-6 border-b border-border/60">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text">
                {currentChapterContent.title}
              </h1>
              <div className="flex items-center gap-3 text-xs font-mono text-subtle pt-2">
                <span>{currentChapterContent.wordCount.toLocaleString()} words</span>
                <span>•</span>
                <span>
                  ~{Math.max(1, Math.round(currentChapterContent.wordCount / 220))} min read
                </span>
                {chapterOffset !== 0 && (
                  <>
                    <span>•</span>
                    <span className="text-accent">
                      Offset {chapterOffset > 0 ? `+${chapterOffset}` : chapterOffset}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Rendered Chapter HTML with Sober Thoughts styling */}
          {currentChapterContent ? (
            <div
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized in epub-parser
              dangerouslySetInnerHTML={{ __html: currentChapterContent.htmlContent }}
              className="read-along-body prose prose-invert max-w-none text-text/95 space-y-4 [&>p]:leading-relaxed [&>p]:text-text/95 [&>h1]:text-text [&>h2]:text-text [&>h3]:text-text [&>blockquote]:border-l-2 [&>blockquote]:border-accent/80 [&>blockquote]:pl-4 [&>blockquote]:text-muted [&>blockquote]:italic [&>img]:mx-auto [&>img]:my-6 [&>img]:rounded [&>img]:border [&>img]:border-border [&>hr]:border-border/60"
            />
          ) : (
            <div className="text-center py-12 text-muted font-mono text-xs">
              Loading chapter text...
            </div>
          )}

          {/* Chapter Navigation Footers */}
          <div className="flex items-center justify-between pt-8 pb-4 border-t border-border mt-10 font-mono text-xs">
            <button
              type="button"
              disabled={activeSpineIndex <= 0}
              onClick={() => setActiveSpineIndex((prev) => Math.max(0, prev - 1))}
              className="px-3 py-1.5 rounded border border-border bg-surface text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous Chapter</span>
            </button>

            <span className="text-[11px] text-subtle">
              {parser ? `${activeSpineIndex + 1} of ${parser.spineCount}` : ""}
            </span>

            <button
              type="button"
              disabled={!parser || activeSpineIndex >= parser.spineCount - 1}
              onClick={() =>
                setActiveSpineIndex((prev) =>
                  Math.min(parser ? parser.spineCount - 1 : prev, prev + 1),
                )
              }
              className="px-3 py-1.5 rounded border border-border bg-surface text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>Next Chapter</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 6. Floating "Snap to Audio" Pill (Shows when user scrolled away) */}
      {isScrollLocked && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            type="button"
            onClick={handleSnapToAudio}
            className="px-4 py-2 rounded-full bg-accent text-bg font-mono font-semibold text-xs flex items-center gap-2 shadow-2xl hover:opacity-95 transition-all cursor-pointer border border-accent/40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Snap to Audio</span>
            <span className="text-[11px] opacity-80 font-mono">
              ({formatSecondsShort(currentTime)})
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
