import { BookmarkPlus, Headphones, X } from "lucide-react";
import { useState } from "react";
import {
  DEFAULT_HEADSET_SETTINGS,
  type HeadsetRemappingSettings,
  type HeadsetSkipAction,
} from "../../lib/headset-remapping";

interface HeadsetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: HeadsetRemappingSettings;
  onUpdateSettings: (settings: HeadsetRemappingSettings) => void;
}

export function HeadsetSettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}: HeadsetSettingsModalProps) {
  const [current, setCurrent] = useState<HeadsetRemappingSettings>(settings);

  if (!isOpen) return null;

  const handleChange = (patch: Partial<HeadsetRemappingSettings>) => {
    const updated = { ...current, ...patch };
    setCurrent(updated);
    onUpdateSettings(updated);
  };

  const handleReset = () => {
    setCurrent(DEFAULT_HEADSET_SETTINGS);
    onUpdateSettings(DEFAULT_HEADSET_SETTINGS);
  };

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: custom accessible backdrop dialog container
      role="dialog"
      aria-modal="true"
      aria-labelledby="headset-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="w-full sm:max-w-md surface-card border-t sm:border border-border sm:rounded-xl shadow-2xl p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 id="headset-title" className="text-base font-semibold text-text tracking-tight">
                Headset & Media Session
              </h2>
              <p className="text-xs font-mono text-muted">
                Bluetooth earbuds, lock-screen & car controls
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-text rounded-md hover:bg-elevated transition-colors cursor-pointer"
            aria-label="Close Headset Settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Remapping */}
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-text">Next Track Button</span>
            <p className="text-[11px] text-muted font-mono">
              Action triggered when pressing Next on Bluetooth earbuds or car controls
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleChange({ nextTrackAction: "skip-seconds" })}
                className={`py-2 px-3 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
                  current.nextTrackAction === "skip-seconds"
                    ? "border-accent bg-accent/15 text-accent font-semibold"
                    : "border-border bg-surface text-muted hover:text-text"
                }`}
              >
                Skip +{current.seekForwardSeconds}s
              </button>
              <button
                type="button"
                onClick={() => handleChange({ nextTrackAction: "chapter" })}
                className={`py-2 px-3 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
                  current.nextTrackAction === "chapter"
                    ? "border-accent bg-accent/15 text-accent font-semibold"
                    : "border-border bg-surface text-muted hover:text-text"
                }`}
              >
                Next Chapter
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-text">Previous Track Button</span>
            <p className="text-[11px] text-muted font-mono">
              Action triggered when pressing Previous on Bluetooth earbuds or car controls
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleChange({ prevTrackAction: "skip-seconds" })}
                className={`py-2 px-3 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
                  current.prevTrackAction === "skip-seconds"
                    ? "border-accent bg-accent/15 text-accent font-semibold"
                    : "border-border bg-surface text-muted hover:text-text"
                }`}
              >
                Skip -{current.seekBackwardSeconds}s
              </button>
              <button
                type="button"
                onClick={() => handleChange({ prevTrackAction: "chapter" })}
                className={`py-2 px-3 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
                  current.prevTrackAction === "chapter"
                    ? "border-accent bg-accent/15 text-accent font-semibold"
                    : "border-border bg-surface text-muted hover:text-text"
                }`}
              >
                Previous Chapter
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            <div className="space-y-1">
              <label htmlFor="forward-skip-select" className="text-xs font-semibold text-text">
                Forward Skip
              </label>
              <select
                id="forward-skip-select"
                value={current.seekForwardSeconds}
                onChange={(e) =>
                  handleChange({ seekForwardSeconds: Number.parseInt(e.target.value, 10) })
                }
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-accent"
              >
                <option value={10}>10 seconds</option>
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={45}>45 seconds</option>
                <option value={60}>60 seconds</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="backward-skip-select" className="text-xs font-semibold text-text">
                Backward Skip
              </label>
              <select
                id="backward-skip-select"
                value={current.seekBackwardSeconds}
                onChange={(e) =>
                  handleChange({ seekBackwardSeconds: Number.parseInt(e.target.value, 10) })
                }
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-accent"
              >
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
              </select>
            </div>
          </div>

          {/* Double-Tap Bookmark */}
          <div className="pt-2 border-t border-border">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={current.doubleTapBookmark}
                onChange={(e) => handleChange({ doubleTapBookmark: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-border text-accent accent-accent"
              />
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                  <BookmarkPlus className="w-3.5 h-3.5 text-accent" />
                  <span>Double-Tap Pause to Bookmark</span>
                </div>
                <p className="text-[11px] text-muted font-mono">
                  Quickly pressing pause twice (&lt;600ms) on your headset button saves a bookmark
                  at your current timestamp without unlocking your phone.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-mono text-muted hover:text-text transition-colors cursor-pointer"
          >
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-accent text-bg font-semibold text-xs rounded-md hover:bg-accent-light transition-colors cursor-pointer"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
