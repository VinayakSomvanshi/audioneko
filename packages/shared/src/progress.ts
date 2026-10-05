/**
 * audioneko: Playback Progress & Completion Rules
 *
 * Provides shared headroom calculation for completion status, in-progress tracking,
 * and percentage calculations across the client and server.
 */

/** Headroom in seconds before end of book to consider it completed (credits skipped) */
export const COMPLETION_HEADROOM_SECONDS = 30;

/** Minimum listening fraction (98%) to consider a title completed even with long credits */
export const COMPLETION_HEADROOM_PERCENT = 0.98;

/**
 * Returns true if an audiobook playback position has reached completion,
 * taking into account headroom for skipping credits (20-30 seconds) or >= 98% listened.
 */
export function isPlaybackCompleted(currentTime: number, duration?: number | null): boolean {
  if (!duration || duration <= 0) return false;
  // Must have listened to something meaningful
  if (currentTime <= 0) return false;

  const remaining = duration - currentTime;
  // If remaining is within headroom (e.g. credits skipped in last 30s)
  if (remaining <= COMPLETION_HEADROOM_SECONDS) return true;

  // Or if >= 98% has been listened to (requires at least 30s listened)
  if (currentTime > 30 && currentTime / duration >= COMPLETION_HEADROOM_PERCENT) {
    return true;
  }

  return false;
}

/**
 * Returns true if a title is in progress:
 * Started (currentTime > 0) AND not completed.
 */
export function isPlaybackInProgress(currentTime: number, duration?: number | null): boolean {
  if (currentTime <= 0) return false;
  return !isPlaybackCompleted(currentTime, duration);
}

/**
 * Calculates progress percentage rounded to the nearest integer (0 - 100).
 */
export function getPlaybackPercent(currentTime: number, duration?: number | null): number {
  if (!duration || duration <= 0 || currentTime <= 0) return 0;
  return Math.min(100, Math.round((currentTime / duration) * 100));
}
