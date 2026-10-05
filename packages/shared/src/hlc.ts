import type { BookProgressRecord, HybridLogicalClock } from "./contracts";

/**
 * Creates a new Hybrid Logical Clock initialized to the given node ID.
 */
export function createHlc(nodeId: string, initialTimeMs?: number): HybridLogicalClock {
  return {
    timeMs: initialTimeMs ?? Date.now(),
    counter: 0,
    nodeId,
  };
}

/**
 * Serializes an HLC into a compact string: `${timeMs}:${counter}:${nodeId}`
 */
export function packHlc(hlc: HybridLogicalClock): string {
  return `${hlc.timeMs}:${hlc.counter}:${hlc.nodeId}`;
}

/**
 * Deserializes an HLC from a packed string.
 */
export function unpackHlc(serialized: string): HybridLogicalClock {
  const parts = serialized.split(":");
  if (parts.length < 3) {
    return {
      timeMs: 0,
      counter: 0,
      nodeId: serialized || "unknown",
    };
  }

  const timeMs = Number.parseInt(parts[0] || "0", 10);
  const counter = Number.parseInt(parts[1] || "0", 10);
  const nodeId = parts.slice(2).join(":");

  return {
    timeMs: Number.isNaN(timeMs) ? 0 : timeMs,
    counter: Number.isNaN(counter) ? 0 : counter,
    nodeId,
  };
}

/**
 * Compares two Hybrid Logical Clocks.
 * Returns > 0 if a is after b, < 0 if a is before b, and 0 if identical.
 */
export function compareHlc(a: HybridLogicalClock, b: HybridLogicalClock): number {
  if (a.timeMs !== b.timeMs) {
    return a.timeMs - b.timeMs;
  }
  if (a.counter !== b.counter) {
    return a.counter - b.counter;
  }
  if (a.nodeId === b.nodeId) {
    return 0;
  }
  return a.nodeId < b.nodeId ? -1 : 1;
}

/**
 * Updates a local HLC on local event or receipt of a remote HLC.
 */
export function tickHlc(
  local: HybridLogicalClock,
  remote?: HybridLogicalClock,
  nowMs: number = Date.now(),
): HybridLogicalClock {
  if (!remote) {
    // Local-only event
    if (nowMs > local.timeMs) {
      return {
        timeMs: nowMs,
        counter: 0,
        nodeId: local.nodeId,
      };
    }
    return {
      timeMs: local.timeMs,
      counter: local.counter + 1,
      nodeId: local.nodeId,
    };
  }

  // Remote event receipt: establish causality
  const maxTime = Math.max(local.timeMs, remote.timeMs, nowMs);

  let newCounter = 0;
  if (maxTime === local.timeMs && maxTime === remote.timeMs) {
    newCounter = Math.max(local.counter, remote.counter) + 1;
  } else if (maxTime === local.timeMs) {
    newCounter = local.counter + 1;
  } else if (maxTime === remote.timeMs) {
    newCounter = remote.counter + 1;
  } else {
    newCounter = 0;
  }

  return {
    timeMs: maxTime,
    counter: newCounter,
    nodeId: local.nodeId,
  };
}

export interface ProgressConflictResolutionOptions {
  isExplicitSeek?: boolean;
}

export interface ProgressConflictResolutionResult {
  updated: boolean;
  record: BookProgressRecord;
}

/**
 * Resolves progress updates using Hybrid Logical Clocks combined with a
 * Monotonic Progress Vector to ensure stale background tabs never overwrite
 * forward listening progress from active mobile/desktop sessions.
 */
export function resolveProgressConflict(
  existing: BookProgressRecord | null,
  incoming: BookProgressRecord,
  options?: ProgressConflictResolutionOptions,
): ProgressConflictResolutionResult {
  if (!existing) {
    return {
      updated: true,
      record: incoming,
    };
  }

  const hlcComparison = compareHlc(incoming.hlc, existing.hlc);

  // 1. If incoming HLC is older than or equal to existing HLC, reject stale update
  if (hlcComparison <= 0) {
    return {
      updated: false,
      record: existing,
    };
  }

  // 2. Incoming HLC is newer. Apply Monotonic Progress Vector safeguard:
  // If the incoming update has an earlier currentTime, is NOT playing,
  // and is NOT an explicit user seek, it is a stale background/idle pause event
  // from another device. We update the playing state (to false) but preserve
  // the user's forward listening position!
  const isPositionRegression = incoming.currentTime < existing.currentTime;
  const isBackgroundPause = !incoming.isPlaying && !options?.isExplicitSeek;

  if (isPositionRegression && isBackgroundPause) {
    return {
      updated: true,
      record: {
        ...incoming,
        currentTime: existing.currentTime,
        duration: Math.max(incoming.duration, existing.duration),
      },
    };
  }

  // 3. Normal progress update (forward progress, actively playing, or explicit seek)
  return {
    updated: true,
    record: incoming,
  };
}
