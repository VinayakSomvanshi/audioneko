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
  errorMessage?: string;
}

export interface StorageEstimateResult {
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
}

const OPFS_ROOT_DIR = "audioneko_books";
const AUDIO_FILE_NAME = "audio.bin";
const META_FILE_NAME = "meta.json";

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
 * Returns disk usage and quota estimates from navigator.storage.
 */
export async function getStorageEstimate(): Promise<StorageEstimateResult> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usageBytes: 0, quotaBytes: 0, percentUsed: 0 };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

    return {
      usageBytes: usage,
      quotaBytes: quota,
      percentUsed: Math.min(100, Math.round(percentUsed * 10) / 10),
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
}

/**
 * Downloads an audiobook from the streaming proxy directly into OPFS using streaming chunk writing.
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

  onProgress?.({
    bookId: meta.bookId,
    status: "downloading",
    downloadedBytes: 0,
    totalBytes: meta.fileSizeBytes || 0,
    progressPercent: 0,
  });

  const bookDir = await booksDir.getDirectoryHandle(meta.bookId, { create: true });
  const audioHandle = await bookDir.getFileHandle(AUDIO_FILE_NAME, { create: true });

  const writable = await audioHandle.createWritable();

  const CHUNK_DOWNLOAD_SIZE = 2 * 1024 * 1024; // 2 MB aligned chunk stream
  const streamUrl = `/api/stream/${meta.bookId}`;

  try {
    let totalBytes = meta.fileSizeBytes || 0;

    // Probe HEAD if size unknown
    if (totalBytes <= 0) {
      try {
        const headRes = await fetch(streamUrl, { method: "HEAD", signal });
        const lenHeader = headRes.headers.get("Content-Length");
        if (lenHeader) totalBytes = Number.parseInt(lenHeader, 10);
      } catch {
        // Fallback
      }
    }

    let downloadedBytes = 0;

    if (totalBytes > CHUNK_DOWNLOAD_SIZE) {
      // Multi-chunk sequential range streaming for large audiobooks
      let offset = 0;
      while (offset < totalBytes) {
        if (signal?.aborted) {
          throw new Error("Download aborted by user");
        }

        const chunkEnd = Math.min(offset + CHUNK_DOWNLOAD_SIZE - 1, totalBytes - 1);
        const chunkRes = await fetch(streamUrl, {
          signal,
          headers: {
            Range: `bytes=${offset}-${chunkEnd}`,
            Accept: "audio/mp4, audio/mpeg, audio/*;q=0.9, */*;q=0.8",
          },
        });

        if (!chunkRes.ok && chunkRes.status !== 206) {
          throw new Error(
            `Failed to download audio chunk [${chunkRes.status}]: ${chunkRes.statusText}`,
          );
        }

        if (!chunkRes.body) {
          throw new Error("Chunk response body is empty or not streamable");
        }

        const reader = chunkRes.body.getReader();
        while (true) {
          if (signal?.aborted) {
            throw new Error("Download aborted by user");
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            await writable.write(value);
            downloadedBytes += value.byteLength;
            const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            onProgress?.({
              bookId: meta.bookId,
              status: "downloading",
              downloadedBytes,
              totalBytes,
              progressPercent: percent,
            });
          }
        }

        offset = chunkEnd + 1;
      }
    } else {
      // Single-shot streaming for smaller audiobooks or tests
      const response = await fetch(streamUrl, {
        signal,
        headers: {
          Accept: "audio/mp4, audio/mpeg, audio/*;q=0.9, */*;q=0.8",
        },
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(
          `Failed to download audio stream: HTTP ${response.status} ${response.statusText}`,
        );
      }

      const contentLengthHeader = response.headers.get("Content-Length");
      if (totalBytes <= 0 && contentLengthHeader) {
        totalBytes = Number.parseInt(contentLengthHeader, 10);
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

          const percent =
            totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;

          onProgress?.({
            bookId: meta.bookId,
            status: "downloading",
            downloadedBytes,
            totalBytes,
            progressPercent: percent,
          });
        }
      }
    }

    await writable.close();

    // Persist meta.json
    const metaHandle = await bookDir.getFileHandle(META_FILE_NAME, { create: true });
    const metaWritable = await metaHandle.createWritable();
    const finalMeta: OfflineBookMeta = {
      ...meta,
      fileSizeBytes: downloadedBytes,
      downloadedAt: Date.now(),
    };
    await metaWritable.write(JSON.stringify(finalMeta, null, 2));
    await metaWritable.close();

    onProgress?.({
      bookId: meta.bookId,
      status: "completed",
      downloadedBytes,
      totalBytes: downloadedBytes,
      progressPercent: 100,
    });
  } catch (err: unknown) {
    try {
      await writable.abort();
    } catch {
      // Ignore abort cleanup errors
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    onProgress?.({
      bookId: meta.bookId,
      status: "error",
      downloadedBytes: 0,
      totalBytes: meta.fileSizeBytes || 0,
      progressPercent: 0,
      errorMessage,
    });

    throw err;
  }
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
