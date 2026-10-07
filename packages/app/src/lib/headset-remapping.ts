/**
 * audioneko: Enhanced Media Session & Headset Hardware Remapping
 *
 * Allows listeners to remap earbud/headphone hardware gestures (Next/Previous buttons,
 * lock-screen controls, car steering-wheel controls) to custom skip intervals
 * or chapter navigation, plus double-tap bookmarking.
 */

export type HeadsetSkipAction = "skip-seconds" | "chapter";

export interface HeadsetRemappingSettings {
  nextTrackAction: HeadsetSkipAction;
  prevTrackAction: HeadsetSkipAction;
  seekBackwardSeconds: number;
  seekForwardSeconds: number;
  doubleTapBookmark: boolean;
}

export const DEFAULT_HEADSET_SETTINGS: HeadsetRemappingSettings = {
  nextTrackAction: "skip-seconds", // Skip 30s instead of jumping entire chapter
  prevTrackAction: "skip-seconds", // Skip 15s instead of jumping entire chapter
  seekBackwardSeconds: 15,
  seekForwardSeconds: 30,
  doubleTapBookmark: true,
};

const STORAGE_KEY = "audioneko_headset_settings";

export function loadHeadsetSettings(): HeadsetRemappingSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_HEADSET_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_HEADSET_SETTINGS,
        ...parsed,
      };
    }
  } catch {
    // fallback on parse error
  }
  return { ...DEFAULT_HEADSET_SETTINGS };
}

export function saveHeadsetSettings(settings: HeadsetRemappingSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}
