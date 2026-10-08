/**
 * audioneko: Theme & Color Palette Selector
 * Tactile popover allowing listeners to switch palettes and modes on the fly.
 */

import { Check, ChevronDown, Moon, Palette, Sun, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../../lib/theme";

interface ThemeSelectorProps {
  className?: string;
}

export function ThemeSelector({ className = "" }: ThemeSelectorProps) {
  const { palette, isDark, setPalette, toggleMode, palettes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const currentPalette = palettes.find((p) => p.id === palette) || palettes[0];
  const swatchColor = isDark ? currentPalette?.swatchDark : currentPalette?.swatchLight;

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      {/* Trigger Button: Shows palette icon, live color dot, theme name on desktop, and chevron */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-1.5 sm:px-2.5 sm:py-1.5 rounded border border-border bg-surface text-muted hover:text-text hover:border-accent transition-colors cursor-pointer flex items-center gap-1.5 sm:gap-2 shadow-xs shrink-0"
        aria-label={`Change theme palette (Current: ${currentPalette?.name})`}
        title={`Theme: ${currentPalette?.name} (${isDark ? "Dark" : "Light"})`}
      >
        <Palette className="w-4 h-4 text-accent shrink-0" />
        <span
          className="w-2.5 h-2.5 rounded-full border border-black/20 dark:border-white/20 shrink-0 shadow-xs"
          style={{ backgroundColor: swatchColor }}
        />
        <span className="hidden sm:inline text-xs font-mono font-medium text-text">
          {currentPalette?.name}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-muted/70 transition-transform duration-200 hidden sm:inline ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <>
          {/* Mobile backdrop to easily dismiss anywhere */}
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs sm:hidden animate-in fade-in duration-150 border-0 p-0 m-0 w-full h-full cursor-default"
            onClick={() => setIsOpen(false)}
            aria-label="Close backdrop"
          />

          {/* Modal Card: Centered on mobile with safe inset; anchored dropdown on desktop */}
          <div className="fixed inset-x-3 top-16 max-w-sm mx-auto z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 surface-card border border-border rounded-lg shadow-2xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-border text-xs font-mono">
              <span className="text-text font-semibold flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-accent" />
                <span>Theme & Mode</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMode}
                  className="px-2 py-1 rounded text-[11px] font-mono border border-border bg-elevated hover:border-accent hover:text-accent transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Toggle Light / Dark mode"
                >
                  {isDark ? (
                    <>
                      <Sun className="w-3.5 h-3.5 text-accent" />
                      <span>Light</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-3.5 h-3.5 text-accent" />
                      <span>Dark</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded text-muted hover:text-text hover:bg-elevated sm:hidden cursor-pointer"
                  aria-label="Close theme selector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Palette List */}
            <div className="space-y-1">
              {palettes.map((p) => {
                const isSelected = p.id === palette;
                const swatch = isDark ? p.swatchDark : p.swatchLight;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPalette(p.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-accent-bg text-text border border-accent/40 font-medium"
                        : "text-muted hover:bg-elevated hover:text-text border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/20 dark:border-white/20 shrink-0 shadow-xs"
                        style={{ backgroundColor: swatch }}
                      />
                      <div className="min-w-0">
                        <div className="text-text truncate">{p.name}</div>
                        <div className="text-[10px] text-subtle truncate">{p.subtitle}</div>
                      </div>
                    </div>

                    {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-border flex items-center justify-between text-[10px] font-mono text-subtle">
              <span>Mode: {isDark ? "Dark (Obsidian)" : "Light (Parchment)"}</span>
              <span className="text-muted">{currentPalette?.name}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
