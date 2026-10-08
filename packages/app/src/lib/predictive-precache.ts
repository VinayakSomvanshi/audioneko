/**
 * audioneko: Predictive Offline Pre-Caching Engine
 * Proactively caches the active audiobook into OPFS (Origin Private File System)
 * on both Wi-Fi and cellular phone data to prevent transit dropouts.
 */

import type { Book, Chapter } from "@audioneko/shared";
import { downloadManager } from "./download-manager";
import { isBookDownloaded, isOpfsSupported } from "./opfs";

export type PrecacheNetworkPreference = "all" | "wifi" | "off";

export const PRECACHE_STORAGE_KEY = "audioneko_predictive_precache";
export const PRECACHE_EVENT_NAME = "audioneko_precache_triggered";

/**
 * Returns current predictive precache preference (default: "all" for cellular + Wi-Fi).
 */
export function getPredictivePrecacheSetting(): PrecacheNetworkPreference {
  if (typeof window === "undefined") return "all";
  try {
    const saved = localStorage.getItem(PRECACHE_STORAGE_KEY);
    if (saved === "wifi" || saved === "off" || saved === "all") {
      return saved;
    }
  } catch {
    // Fallback to default
  }
  return "all";
}

/**
 * Updates predictive precache preference in localStorage.
 */
export function setPredictivePrecacheSetting(setting: PrecacheNetworkPreference): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRECACHE_STORAGE_KEY, setting);
  } catch (err) {
    console.warn("[predictive-precache] Failed to persist setting:", err);
  }
}

/**
 * Determines whether network connection is eligible under current user preference.
 */
function isNetworkEligible(pref: PrecacheNetworkPreference): boolean {
  if (pref === "off") return false;
  if (pref === "all") return true;

  // If set to "wifi", check NetworkInformation API if available
  if (typeof navigator !== "undefined" && "connection" in navigator) {
    const navConn = (
      navigator as unknown as { connection?: { type?: string; effectiveType?: string } }
    ).connection;
    if (navConn?.type) {
      if (navConn.type === "cellular" || navConn.type === "bluetooth") {
        return false;
      }
    }
  }

  return true;
}

/**
 * Proactively precaches an audiobook into OPFS in the background.
 * Works seamlessly across both cellular phone data and Wi-Fi networks.
 */
export async function triggerPredictivePrecache(
  book: Book,
  chapters?: Chapter[],
): Promise<boolean> {
  if (!book?.id) return false;
  if (!isOpfsSupported()) return false;

  const pref = getPredictivePrecacheSetting();
  if (!isNetworkEligible(pref)) {
    return false;
  }

  try {
    // 1. Check if already completely downloaded
    const alreadyDownloaded = await isBookDownloaded(book.id);
    if (alreadyDownloaded) {
      return false;
    }

    // 2. Check if already active or queued in DownloadManager
    const existingTask = downloadManager.getTask(book.id);
    if (
      existingTask &&
      (existingTask.status === "downloading" || existingTask.status === "queued")
    ) {
      return false;
    }

    // 3. Enqueue unobtrusively into download manager
    await downloadManager.enqueue({
      bookId: book.id,
      title: book.title,
      author: book.author,
      durationSeconds: book.durationSeconds || 0,
      coverR2Key: book.coverR2Key,
      fileSizeBytes: book.fileSizeBytes || 0,
      downloadedAt: Date.now(),
      format: book.format || "m4b",
      chapters,
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(PRECACHE_EVENT_NAME, {
          detail: { bookId: book.id, title: book.title, preference: pref },
        }),
      );
    }

    return true;
  } catch (err) {
    console.warn("[predictive-precache] Error enqueuing predictive cache:", err);
    return false;
  }
}
