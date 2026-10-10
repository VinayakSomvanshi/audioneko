import type { Chapter } from "@audioneko/shared";

export interface OfflineBookMeta {
  bookId: string;
  title: string;
  author: string;
  durationSeconds: number;
  coverR2Key?: string | null;
  coverUrl?: string | null;
  fileSizeBytes: number;
  downloadedAt: number;
  format?: "m4b" | "mp3" | "m4a" | "flac" | "opus";
  mimeType?: string;
  chapters?: Chapter[];
}

export type DownloadStatus = "idle" | "downloading" | "paused" | "completed" | "error";

export interface DownloadProgress {
  bookId: string;
  status: DownloadStatus;
  downloadedBytes: number;
  totalBytes: number;
  progressPercent: number;
  speedBytesPerSec?: number;
  estimatedTimeSeconds?: number;
  errorMessage?: string;
}

export interface StorageEstimateResult {
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  isPersisted?: boolean;
}

export const OPFS_ROOT_DIR = "audioneko_books";
export const AUDIO_FILE_NAME = "audio.bin";
export const PART_FILE_NAME = "audio.part";
export const COVER_FILE_NAME = "cover.jpg";
export const META_FILE_NAME = "meta.json";

/**
 * Checks whether the Origin Private File System (OPFS) is supported by the current browser.
 */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.getDirectory === "function"
  );
}

/**
 * Returns whether persistent storage has been granted to the origin.
 */
export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.storage?.persisted) {
    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Requests persistent storage from the browser to unlock high-capacity disk quota on phones / PWA.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    try {
      const alreadyPersisted = await isStoragePersisted();
      if (alreadyPersisted) return true;
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Formats low-level storage and network errors into clear, actionable advice.
 */
export function formatDownloadErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (
      err.name === "QuotaExceededError" ||
      err.message.toLowerCase().includes("quota") ||
      err.message.toLowerCase().includes("storage")
    ) {
      return "Device storage quota exceeded. Free up storage space on your phone or remove other downloaded audiobooks in Offline settings.";
    }
    if (err.name === "AbortError" || err.message.toLowerCase().includes("aborted")) {
      return "Download paused.";
    }
    if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      return "Network connection interrupted. Check your internet connection and resume.";
    }
    return err.message;
  }
  return String(err || "Download failed");
}

/**
 * Returns disk usage and quota estimates from navigator.storage.
 */
export async function getStorageEstimate(): Promise<StorageEstimateResult> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usageBytes: 0, quotaBytes: 0, percentUsed: 0 };
  }

  try {
    const isPersisted = await isStoragePersisted();
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

    return {
      usageBytes: usage,
      quotaBytes: quota,
      percentUsed: Math.min(100, Math.round(percentUsed * 10) / 10),
      isPersisted,
    };
  } catch (err) {
    console.warn("Failed to retrieve storage estimate:", err);
    return { usageBytes: 0, quotaBytes: 0, percentUsed: 0 };
  }
}

/**
 * Gets or creates the root directory handle for audioneko downloads.
 */
async function getBooksDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsSupported()) return null;

  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_ROOT_DIR, { create: true });
  } catch (err) {
    console.warn("Failed to access OPFS root directory:", err);
    return null;
  }
}

/**
 * Checks if a specific audiobook is completely downloaded and available offline.
 */
export async function isBookDownloaded(bookId: string): Promise<boolean> {
  const booksDir = await getBooksDirectory();
  if (!booksDir) return false;

  try {
    const bookDir = await booksDir.getDirectoryHandle(bookId);
    const audioHandle = await bookDir.getFileHandle(AUDIO_FILE_NAME);
    const metaHandle = await bookDir.getFileHandle(META_FILE_NAME);

    const [audioFile, metaFile] = await Promise.all([audioHandle.getFile(), metaHandle.getFile()]);

    return audioFile.size > 0 && metaFile.size > 0;
  } catch {
    return false;
  }
}

/**
 * Checks if a partial download file (audio.part) exists and returns its byte size.
 */
export async function getPartialDownloadBytes(bookId: string): Promise<number> {
  const booksDir = await getBooksDirectory();
  if (!booksDir) return 0;

  try {
    const bookDir = await booksDir.getDirectoryHandle(bookId);
    const partHandle = await bookDir.getFileHandle(PART_FILE_NAME);
    const file = await partHandle.getFile();
    return file.size;
  } catch {
    return 0;
  }
}

/**
 * Removes incomplete audio.part file if cancelled or resetting.
 */
export async function removePartialDownload(bookId: string): Promise<void> {
  const booksDir = await getBooksDirectory();
  if (!booksDir) return;

  try {
    const bookDir = await booksDir.getDirectoryHandle(bookId);
    await bookDir.removeEntry(PART_FILE_NAME);
  } catch {
    // Ignore if not present
  }
}

/**
 * Saves a book cover image to OPFS.
 */
export async function saveBookCoverToOpfs(
  bookId: string,
  coverData: ArrayBuffer | Blob,
): Promise<void> {
  const booksDir = await getBooksDirectory();
  if (!booksDir) return;

  try {
    const bookDir = await booksDir.getDirectoryHandle(bookId, { create: true });
    const coverHandle = await bookDir.getFileHandle(COVER_FILE_NAME, { create: true });
    const writable = await coverHandle.createWritable();
    await writable.write(coverData);
    await writable.close();
  } catch (err) {
    console.warn(`Failed to save cover for ${bookId} in OPFS:`, err);
  }
}

/**
 * Retrieves an Object URL for the downloaded book cover stored in OPFS if available.
 */
export async function getBookCoverBlobUrl(bookId: string): Promise<string | null> {
  const booksDir = await getBooksDirectory();
  if (!booksDir) return null;

  try {
    const bookDir = await booksDir.getDirectoryHandle(bookId);
    const coverHandle = await bookDir.getFileHandle(COVER_FILE_NAME);
    const coverFile = await coverHandle.getFile();
    if (coverFile.size > 0) {
      return URL.createObjectURL(coverFile);
    }
  } catch {
    // Cover not cached in OPFS
  }
  return null;
}

/**
 * Lists all audiobooks currently downloaded to the local OPFS storage.
 */
export async function getDownloadedBooks(): Promise<OfflineBookMeta[]> {
  const booksDir = await getBooksDirectory();
  if (!booksDir) return [];

  const results: OfflineBookMeta[] = [];

  try {
    // Iterate over directory entries
    // @ts-expect-error - values() is standard on FileSystemDirectoryHandle async iterable
    for await (const entry of booksDir.values()) {
      if (entry.kind === "directory") {
        const bookDir = entry as FileSystemDirectoryHandle;
        try {
          const metaHandle = await bookDir.getFileHandle(META_FILE_NAME);
          const metaFile = await metaHandle.getFile();
          const metaText = await metaFile.text();
          const parsed = JSON.parse(metaText) as OfflineBookMeta;

          // Double check audio file presence and verify actual byte size
          const audioHandle = await bookDir.getFileHandle(AUDIO_FILE_NAME);
          const audioFile = await audioHandle.getFile();

          if (audioFile.size > 0) {
            results.push({
              ...parsed,
              fileSizeBytes: audioFile.size,
            });
          }
        } catch {
          // Incomplete or corrupted download directory; skip
        }
      }
    }
  } catch (err) {
    console.warn("Failed to enumerate downloaded books:", err);
  }

  return results.sort((a, b) => b.downloadedAt - a.downloadedAt);
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
  resumeFromOffset?: number;
}

/**
 * Downloads an audiobook from the streaming proxy directly into OPFS using streaming chunk writing.
 * Supports resuming via HTTP Range requests into audio.part before finalizing to audio.bin.
 * Eliminates memory exhaustion by avoiding in-memory Blob/ArrayBuffer accumulation.
 */
export async function downloadBookToOpfs(
  meta: OfflineBookMeta,
  options?: DownloadOptions,
): Promise<void> {
  const booksDir = await getBooksDirectory();
  if (!booksDir) {
    throw new Error("Origin Private File System (OPFS) is not supported on this device/browser.");
  }

  const { onProgress, signal } = options ?? {};
  const bookDir = await booksDir.getDirectoryHandle(meta.bookId, { create: true });

  // Check if existing audio.part exists for resume
  let existingBytes = 0;
  try {
    const existingPart = await bookDir.getFileHandle(PART_FILE_NAME);
    const partFile = await existingPart.getFile();
    existingBytes = partFile.size;
  } catch {
    existingBytes = 0;
  }

  const streamUrl = `/api/stream/${meta.bookId}`;

  // Determine total bytes
  let totalBytes = meta.fileSizeBytes || 0;
  if (totalBytes <= 0) {
    try {
      const headRes = await fetch(streamUrl, { method: "HEAD", signal });
      const lenHeader = headRes.headers.get("Content-Length");
      if (lenHeader) totalBytes = Number.parseInt(lenHeader, 10);
    } catch {
      // Fallback
    }
  }

  // If already fully downloaded in audio.part
  if (totalBytes > 0 && existingBytes >= totalBytes) {
    await finalizeDownload(bookDir, meta, totalBytes);
    onProgress?.({
      bookId: meta.bookId,
      status: "completed",
      downloadedBytes: totalBytes,
      totalBytes,
      progressPercent: 100,
    });
    return;
  }

  // Request persistent storage to unlock high capacity on mobile / PWA
  await requestPersistentStorage().catch(() => {});

  // Pre-flight check: verify remaining storage quota before initiating large stream
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const quota = estimate.quota ?? 0;
      const usage = estimate.usage ?? 0;
      const remainingBytes = Math.max(0, quota - usage);
      const neededBytes = totalBytes > 0 ? Math.max(0, totalBytes - existingBytes) : 0;
      if (quota > 0 && neededBytes > 0 && remainingBytes < neededBytes + 15 * 1024 * 1024) {
        const quotaErr = new Error(
          "Device storage quota exceeded. Free up storage space on your phone or remove other downloaded audiobooks in Offline settings.",
        );
        quotaErr.name = "QuotaExceededError";
        throw quotaErr;
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "QuotaExceededError") throw e;
    }
  }

  const partHandle = await bookDir.getFileHandle(PART_FILE_NAME, { create: true });
  // Open writable stream. If existing bytes exist, seek to end
  const writable = await partHandle.createWritable({
    keepExistingData: existingBytes > 0,
  });

  if (existingBytes > 0) {
    await writable.seek(existingBytes);
  }

  let downloadedBytes = existingBytes;
  let lastSpeedTime = Date.now();
  let lastSpeedBytes = downloadedBytes;

  onProgress?.({
    bookId: meta.bookId,
    status: "downloading",
    downloadedBytes,
    totalBytes: totalBytes || 0,
    progressPercent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
  });

  try {
    const rangeHeader = existingBytes > 0 ? `bytes=${existingBytes}-` : undefined;
    const headers: Record<string, string> = {
      Accept: "audio/mp4, audio/mpeg, audio/*;q=0.9, */*;q=0.8",
    };
    if (rangeHeader) {
      headers.Range = rangeHeader;
    }

    const response = await fetch(streamUrl, {
      signal,
      headers,
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(
        `Failed to download audio stream: HTTP ${response.status} ${response.statusText}`,
      );
    }

    if (totalBytes <= 0) {
      const cl = response.headers.get("Content-Length");
      const cr = response.headers.get("Content-Range");
      if (cr) {
        const totalMatch = cr.match(/\/(\d+)$/);
        if (totalMatch?.[1]) totalBytes = Number.parseInt(totalMatch[1], 10);
      } else if (cl) {
        totalBytes = existingBytes + Number.parseInt(cl, 10);
      }
    }

    if (!response.body) {
      throw new Error("Response body is empty or not streamable");
    }

    const reader = response.body.getReader();

    while (true) {
      if (signal?.aborted) {
        throw new Error("Download aborted by user");
      }

      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        await writable.write(value);
        downloadedBytes += value.byteLength;

        const now = Date.now();
        let speedBytesPerSec: number | undefined;
        let estimatedTimeSeconds: number | undefined;

        if (now - lastSpeedTime >= 800) {
          const elapsedSec = (now - lastSpeedTime) / 1000;
          const diffBytes = downloadedBytes - lastSpeedBytes;
          speedBytesPerSec = Math.round(diffBytes / elapsedSec);
          if (speedBytesPerSec > 0 && totalBytes > downloadedBytes) {
            estimatedTimeSeconds = Math.round((totalBytes - downloadedBytes) / speedBytesPerSec);
          }
          lastSpeedTime = now;
          lastSpeedBytes = downloadedBytes;
        }

        const percent =
          totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;

        onProgress?.({
          bookId: meta.bookId,
          status: "downloading",
          downloadedBytes,
          totalBytes,
          progressPercent: percent,
          speedBytesPerSec,
          estimatedTimeSeconds,
        });
      }
    }

    await writable.close();

    // Finalize download: promote audio.part to audio.bin, save cover & meta
    await finalizeDownload(bookDir, meta, downloadedBytes);

    onProgress?.({
      bookId: meta.bookId,
      status: "completed",
      downloadedBytes,
      totalBytes: downloadedBytes,
      progressPercent: 100,
    });
  } catch (err: unknown) {
    try {
      await writable.close();
    } catch {
      // Ignore cleanup error
    }

    const formattedMessage = formatDownloadErrorMessage(err);
    const isAbort =
      err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));

    onProgress?.({
      bookId: meta.bookId,
      status: isAbort ? "paused" : "error",
      downloadedBytes,
      totalBytes: totalBytes || meta.fileSizeBytes || 0,
      progressPercent:
        totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0,
      errorMessage: isAbort ? undefined : formattedMessage,
    });

    throw err;
  }
}

/**
 * Promotes audio.part to audio.bin, caches cover picture, and writes meta.json.
 */
async function finalizeDownload(
  bookDir: FileSystemDirectoryHandle,
  meta: OfflineBookMeta,
  finalSizeBytes: number,
): Promise<void> {
  const partHandle = await bookDir.getFileHandle(PART_FILE_NAME);

  // Check if native atomic move is supported (modern Chromium / Android OPFS)
  // This avoids doubling disk usage by not having to copy 500MB from part to bin!
  let moved = false;
  if (
    "move" in partHandle &&
    typeof (partHandle as { move?: (name: string) => Promise<void> }).move === "function"
  ) {
    try {
      await (partHandle as { move: (name: string) => Promise<void> }).move(AUDIO_FILE_NAME);
      moved = true;
    } catch {
      moved = false;
    }
  }

  if (!moved) {
    const partFile = await partHandle.getFile();
    // Write final audio.bin via streaming chunks (fallback for engines without move)
    const audioHandle = await bookDir.getFileHandle(AUDIO_FILE_NAME, { create: true });
    const audioWritable = await audioHandle.createWritable();

    const CHUNK_SIZE = 4 * 1024 * 1024;
    let offset = 0;
    while (offset < partFile.size) {
      const slice = partFile.slice(offset, offset + CHUNK_SIZE);
      const buf = await slice.arrayBuffer();
      await audioWritable.write(new Uint8Array(buf));
      offset += CHUNK_SIZE;
    }
    await audioWritable.close();

    // Delete audio.part
    try {
      await bookDir.removeEntry(PART_FILE_NAME);
    } catch {
      // Ignore
    }
  }

  // Cache cover picture into OPFS
  try {
    const coverUrl = meta.coverUrl || `/api/covers/${meta.bookId}`;
    const coverRes = await fetch(coverUrl);
    if (coverRes.ok) {
      const coverBuf = await coverRes.arrayBuffer();
      if (coverBuf.byteLength > 0) {
        const coverHandle = await bookDir.getFileHandle(COVER_FILE_NAME, { create: true });
        const coverWritable = await coverHandle.createWritable();
        await coverWritable.write(coverBuf);
        await coverWritable.close();
      }
    }
  } catch {
    // Cover download failure is non-fatal
  }

  // Persist meta.json
  const metaHandle = await bookDir.getFileHandle(META_FILE_NAME, { create: true });
  const metaWritable = await metaHandle.createWritable();
  const finalMeta: OfflineBookMeta = {
    ...meta,
    fileSizeBytes: finalSizeBytes,
    downloadedAt: Date.now(),
  };
  await metaWritable.write(JSON.stringify(finalMeta, null, 2));
  await metaWritable.close();
}

/**
 * Removes an audiobook from OPFS offline storage.
 */
export async function deleteDownloadedBook(bookId: string): Promise<void> {
  const booksDir = await getBooksDirectory();
  if (!booksDir) return;

  try {
    await booksDir.removeEntry(bookId, { recursive: true });
  } catch (err) {
    console.warn(`Failed to delete downloaded book ${bookId}:`, err);
  }
}

/**
 * Clears all downloaded audiobooks from OPFS storage.
 */
export async function clearAllDownloadedBooks(): Promise<void> {
  if (!isOpfsSupported()) return;

  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_ROOT_DIR, { recursive: true });
  } catch (err) {
    console.warn("Failed to clear OPFS books directory:", err);
  }
}
