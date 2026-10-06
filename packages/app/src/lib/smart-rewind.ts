/**
 * audioneko: Smart Resume Rewind Engine
 * Automatically rewinds playback when resuming after pauses or interruptions
 * to restore conversational and narrative context.
 */

export interface SmartRewindOptions {
  enabled: boolean;
  minPauseSeconds: number; // minimum pause duration before rewind kicks in
  rewindDurationSeconds: number; // base seconds to rewind
  dynamicMode: boolean; // progressive rewind based on pause length
}

export const DEFAULT_SMART_REWIND_OPTIONS: SmartRewindOptions = {
  enabled: true,
  minPauseSeconds: 45, // 45 seconds pause
  rewindDurationSeconds: 10,
  dynamicMode: true,
};

const STORAGE_KEY = "audioneko_smart_rewind_settings";

export function loadSmartRewindSettings(): SmartRewindOptions {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_SMART_REWIND_OPTIONS;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SMART_REWIND_OPTIONS;
    return { ...DEFAULT_SMART_REWIND_OPTIONS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SMART_REWIND_OPTIONS;
  }
}

export function saveSmartRewindSettings(settings: Partial<SmartRewindOptions>): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const current = loadSmartRewindSettings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...settings }));
  } catch {
    // Ignore localStorage write failures
  }
}

/**
 * Computes whether smart rewind should trigger and the new target position.
 */
export function computeSmartRewind(
  pausedAtMs: number | null,
  currentPositionSeconds: number,
  nowMs = Date.now(),
  userOptions: Partial<SmartRewindOptions> = {},
): { shouldRewind: boolean; rewindSeconds: number; targetPositionSeconds: number } {
  const options = { ...DEFAULT_SMART_REWIND_OPTIONS, ...userOptions };

  if (!options.enabled || !pausedAtMs || pausedAtMs <= 0) {
    return { shouldRewind: false, rewindSeconds: 0, targetPositionSeconds: currentPositionSeconds };
  }

  const elapsedPauseSeconds = Math.max(0, (nowMs - pausedAtMs) / 1000);

  if (elapsedPauseSeconds < options.minPauseSeconds) {
    return { shouldRewind: false, rewindSeconds: 0, targetPositionSeconds: currentPositionSeconds };
  }

  let rewindAmount = options.rewindDurationSeconds;

  if (options.dynamicMode) {
    if (elapsedPauseSeconds >= 3600) {
      // Paused for over 1 hour -> rewind 25s
      rewindAmount = 25;
    } else if (elapsedPauseSeconds >= 900) {
      // Paused for over 15 minutes -> rewind 15s
      rewindAmount = 15;
    } else if (elapsedPauseSeconds >= 300) {
      // Paused for over 5 minutes -> rewind 10s
      rewindAmount = 10;
    } else {
      // Paused for 45s - 5m -> rewind 5s
      rewindAmount = 5;
    }
  }

  // Ensure we do not rewind before start of book
  const targetPosition = Math.max(0, currentPositionSeconds - rewindAmount);
  const actualRewind = Math.max(0, currentPositionSeconds - targetPosition);

  return {
    shouldRewind: actualRewind > 0,
    rewindSeconds: actualRewind,
    targetPositionSeconds: targetPosition,
  };
}
