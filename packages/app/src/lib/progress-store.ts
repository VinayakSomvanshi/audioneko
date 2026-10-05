/**
 * audioneko: Local Playback Progress Store
 *
 * Persists per-book playback positions to localStorage so they survive
 * abrupt tab closes. Writes are throttled (every 5 s) during playback and
 * flushed immediately on `beforeunload`.
 */

const STORAGE_KEY = "audioneko_progress";
const MAX_ENTRIES = 200; // prune oldest beyond this to stay lean

export interface ProgressEntry {
  bookId: string;
  position: number; // seconds
  duration: number; // seconds, for computing percentage
  updatedAt: number; // unix ms
}

type ProgressMap = Record<string, ProgressEntry>;

function load(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ProgressMap;
  } catch {
    return {};
  }
}

function save(map: ProgressMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded — fail silently
  }
}

/** Returns the saved progress entry for a book, or null if none. */
export function getProgress(bookId: string): ProgressEntry | null {
  const map = load();
  return map[bookId] ?? null;
}

/** Persists the current playback position for a book. */
export function setProgress(bookId: string, position: number, duration: number): void {
  const map = load();
  map[bookId] = { bookId, position, duration, updatedAt: Date.now() };

  // Prune oldest entries if over limit
  const entries = Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
  const pruned: ProgressMap = {};
  for (const e of entries.slice(0, MAX_ENTRIES)) {
    pruned[e.bookId] = e;
  }

  save(pruned);
}

/** Clears saved progress for a book (e.g. after finishing). */
export function clearProgress(bookId: string): void {
  const map = load();
  delete map[bookId];
  save(map);
}

/**
 * Throttled write manager — call `tick()` from timeupdate, call `flush()`
 * from beforeunload.
 */
export class ProgressTracker {
  private lastSave = 0;
  private readonly throttleMs: number;

  constructor(throttleMs = 5000) {
    this.throttleMs = throttleMs;
  }

  tick(bookId: string, position: number, duration: number): void {
    const now = Date.now();
    if (now - this.lastSave >= this.throttleMs) {
      setProgress(bookId, position, duration);
      this.lastSave = now;
    }
  }

  flush(bookId: string, position: number, duration: number): void {
    setProgress(bookId, position, duration);
    this.lastSave = Date.now();
  }
}

export const progressTracker = new ProgressTracker(5000);
