import type { EqualizerPresetId } from "./equalizer";
import { loadHeadsetSettings, saveHeadsetSettings } from "./headset-remapping";
import { loadSmartRewindSettings, saveSmartRewindSettings } from "./smart-rewind";

export interface UserPreferences {
  seekBackwardSeconds: number;
  seekForwardSeconds: number;
  defaultPlaybackRate: number;
  smartRewindEnabled: boolean;
  smartRewindDurationSeconds: number;
  doubleTapBookmark: boolean;
  equalizerPreset: EqualizerPresetId;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  seekBackwardSeconds: 15,
  seekForwardSeconds: 30,
  defaultPlaybackRate: 1.0,
  smartRewindEnabled: true,
  smartRewindDurationSeconds: 10,
  doubleTapBookmark: true,
  equalizerPreset: "flat",
};

const PREFERENCES_KEY = "audioneko_user_preferences";

export function loadUserPreferences(): UserPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_USER_PREFERENCES };
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    const headset = loadHeadsetSettings();
    const smart = loadSmartRewindSettings();
    const parsed = raw ? JSON.parse(raw) : {};

    return {
      ...DEFAULT_USER_PREFERENCES,
      seekBackwardSeconds: headset.seekBackwardSeconds || 15,
      seekForwardSeconds: headset.seekForwardSeconds || 30,
      doubleTapBookmark: headset.doubleTapBookmark ?? true,
      smartRewindEnabled: smart.enabled ?? true,
      smartRewindDurationSeconds: smart.rewindDurationSeconds || 10,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

export function saveUserPreferences(prefs: Partial<UserPreferences>): UserPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_USER_PREFERENCES, ...prefs };
  try {
    const current = loadUserPreferences();
    const updated: UserPreferences = { ...current, ...prefs };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));

    // Synchronize underlying specialized engines
    saveHeadsetSettings({
      ...loadHeadsetSettings(),
      seekBackwardSeconds: updated.seekBackwardSeconds,
      seekForwardSeconds: updated.seekForwardSeconds,
      doubleTapBookmark: updated.doubleTapBookmark,
    });

    saveSmartRewindSettings({
      ...loadSmartRewindSettings(),
      enabled: updated.smartRewindEnabled,
      rewindDurationSeconds: updated.smartRewindDurationSeconds,
    });

    window.dispatchEvent(new CustomEvent("audioneko:preferences-updated", { detail: updated }));
    return updated;
  } catch {
    return { ...DEFAULT_USER_PREFERENCES, ...prefs };
  }
}
