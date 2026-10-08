/**
 * audioneko: Theme & Color Palette Selector
 * Tactile popover allowing listeners to switch palettes and modes on the fly.
 */

import { Check, Moon, Palette, Sun } from "lucide-react";
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

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-2 rounded border border-border bg-surface text-muted hover:text-text hover:border-accent transition-colors cursor-pointer flex items-center gap-1.5"
        aria-label="Change theme palette"
        title="Theme and appearance"
      >
        <Palette className="w-4 h-4 text-accent" />
        <span
          className="w-2 h-2 rounded-full border border-border/80 shrink-0"
          style={{
            backgroundColor: isDark ? currentPalette?.swatchDark : currentPalette?.swatchLight,
          }}
        />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 surface-card border border-border rounded-lg shadow-2xl z-50 p-3 space-y-3 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-2 border-b border-border text-xs font-mono">
            <span className="text-text font-semibold flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-accent" />
              <span>Theme Palette</span>
            </span>
            <button
              type="button"
              onClick={toggleMode}
              className="px-2 py-0.5 rounded text-[11px] font-mono border border-border bg-elevated hover:border-accent hover:text-accent transition-colors flex items-center gap-1 cursor-pointer"
              title="Toggle Light / Dark mode"
            >
              {isDark ? (
                <>
                  <Sun className="w-3 h-3 text-accent" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3 h-3 text-accent" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>

          {/* Palette List */}
          <div className="space-y-1">
            {palettes.map((p) => {
              const isSelected = p.id === palette;
              const swatchColor = isDark ? p.swatchDark : p.swatchLight;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPalette(p.id);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-accent-bg text-text border border-accent/40 font-medium"
                      : "text-muted hover:bg-elevated hover:text-text border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-border/80 shrink-0 shadow-xs"
                      style={{ backgroundColor: swatchColor }}
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
      )}
    </div>
  );
}
