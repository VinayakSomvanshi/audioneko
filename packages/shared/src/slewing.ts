/**
 * audioneko: Audio Clock Slewing Engine for Listen-Along Synchronous Rooms
 *
 * Mathematical clock alignment ensuring followers synchronize with the host
 * within ±50ms with zero audio popping, stuttering, or clicks.
 */

export interface SlewingResult {
  targetRate: number;
  requiresHardSeek: boolean;
  seekTargetSeconds?: number;
  deltaSeconds: number;
  status: "in_sync" | "slewing_up" | "slewing_down" | "hard_seek" | "paused";
}

/**
 * Computes authoritative host target position factoring in elapsed time and playback rate.
 */
export function computeTargetHostPosition(
  hostPosition: number,
  epochSnapshotTimeMs: number,
  currentClientTimeMs: number,
  hostPlaybackRate: number,
  isPlaying: boolean,
): number {
  if (!isPlaying) {
    return hostPosition;
  }
  const elapsedSeconds = Math.max(0, (currentClientTimeMs - epochSnapshotTimeMs) / 1000);
  return hostPosition + elapsedSeconds * hostPlaybackRate;
}

/**
 * Calculates whether follower audio should play normally, slew rate up/down, or hard seek.
 */
export function computeClockSlewing(
  targetPosition: number,
  currentPosition: number,
  basePlaybackRate: number,
  isPlaying: boolean,
): SlewingResult {
  if (!isPlaying) {
    const deltaSeconds = targetPosition - currentPosition;
    return {
      targetRate: basePlaybackRate,
      requiresHardSeek: Math.abs(deltaSeconds) > 0.5,
      seekTargetSeconds: targetPosition,
      deltaSeconds,
      status: "paused",
    };
  }

  const deltaSeconds = targetPosition - currentPosition;

  // 1. In sync (< 50ms tolerance)
  if (Math.abs(deltaSeconds) < 0.05) {
    return {
      targetRate: basePlaybackRate,
      requiresHardSeek: false,
      deltaSeconds,
      status: "in_sync",
    };
  }

  // 2. Minor desync between 50ms and 2000ms: Smooth Clock Slewing
  if (deltaSeconds >= 0.05 && deltaSeconds <= 2.0) {
    // Follower is slightly behind host -> speed up by 5%
    return {
      targetRate: Number((basePlaybackRate * 1.05).toFixed(3)),
      requiresHardSeek: false,
      deltaSeconds,
      status: "slewing_up",
    };
  }

  if (deltaSeconds <= -0.05 && deltaSeconds >= -2.0) {
    // Follower is slightly ahead of host -> slow down by 5%
    return {
      targetRate: Number((basePlaybackRate * 0.95).toFixed(3)),
      requiresHardSeek: false,
      deltaSeconds,
      status: "slewing_down",
    };
  }

  // 3. Major desync (> 2.0s): Hard seek to host position
  return {
    targetRate: basePlaybackRate,
    requiresHardSeek: true,
    seekTargetSeconds: targetPosition,
    deltaSeconds,
    status: "hard_seek",
  };
}
