/**
 * audioneko: Cloudflare R2 "Active Shelf" LRU Cache & Pre-Caching Engine
 *
 * Zero-Cost Architecture:
 * - R2 free tier provides 10 GB storage with zero egress fees.
 * - Active Shelf holds top active audiobooks up to an 8.5 GB high-water mark.
 * - Strictly optional: If env.R2 is undefined (user on 100% free plan without credit card),
 *   all operations cleanly no-op and audio is streamed directly from Google Drive.
 */

import { eq, sql } from "drizzle-orm";
import { type Database, createDb } from "../db";
import { books, files, progress } from "../db/schema";
import { getGoogleAccessToken } from "../drive/token";
import type { Env, ShelfQueueMessage } from "../types";

export const MAX_ACTIVE_SHELF_BYTES = 8.5 * 1024 * 1024 * 1024; // 8.5 GB (9,126,805,504 bytes)
export const ACTIVE_SHELF_PREFIX = "audio/";

export interface R2ObjectMeta {
  key: string;
  size: number;
  uploaded: Date;
  bookId?: string;
  driveFileId?: string;
}

export interface ActiveShelfStatus {
  isR2Enabled: boolean;
  totalCachedBytes: number;
  maxCapacityBytes: number;
  usagePercent: number;
  cachedCount: number;
  books: Array<{
    bookId: string;
    title: string;
    sizeBytes: number;
    cachedAt?: number;
  }>;
}

export interface EvictionResult {
  evictedBookIds: string[];
  freedBytes: number;
  reason?: string;
}

export interface PrecacheResult {
  success: boolean;
  alreadyCached?: boolean;
  bookId?: string;
  bytesCached?: number;
  reason?: string;
}

/**
 * Lists all cached audio files in R2 under the audio/ prefix
 */
export async function listActiveShelfObjects(
  r2: R2Bucket,
): Promise<{ objects: R2ObjectMeta[]; totalBytes: number }> {
  const objects: R2ObjectMeta[] = [];
  let totalBytes = 0;
  let truncated = true;
  let cursor: string | undefined;

  while (truncated) {
    const listResult = await r2.list({
      prefix: ACTIVE_SHELF_PREFIX,
      cursor,
    });

    for (const obj of listResult.objects) {
      objects.push({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        bookId: obj.customMetadata?.bookId,
        driveFileId: obj.customMetadata?.driveFileId,
      });
      totalBytes += obj.size;
    }

    truncated = listResult.truncated;
    cursor = listResult.truncated ? listResult.cursor : undefined;
  }

  return { objects, totalBytes };
}

/**
 * Retrieves the current status, capacity, and active books in R2 Active Shelf
 */
export async function getActiveShelfStatus(
  env: Env,
  customDb?: Database,
): Promise<ActiveShelfStatus> {
  if (!env.R2) {
    return {
      isR2Enabled: false,
      totalCachedBytes: 0,
      maxCapacityBytes: MAX_ACTIVE_SHELF_BYTES,
      usagePercent: 0,
      cachedCount: 0,
      books: [],
    };
  }

  const { objects, totalBytes } = await listActiveShelfObjects(env.R2);
  const db = customDb ?? createDb(env.DB);

  // Fetch titles for active shelf books from D1
  const activeBooks = await db.query.books.findMany({
    where: eq(books.isActiveShelf, true),
  });

  const activeBooksMap = new Map(activeBooks.map((b) => [b.id, b]));

  const shelfBooks = objects.map((obj) => {
    const matchedBook = obj.bookId ? activeBooksMap.get(obj.bookId) : undefined;
    return {
      bookId: obj.bookId || obj.key.replace(ACTIVE_SHELF_PREFIX, ""),
      title: matchedBook?.title || "Audiobook",
      sizeBytes: obj.size,
      cachedAt: obj.uploaded.getTime(),
    };
  });

  const usagePercent = Math.min(100, Math.round((totalBytes / MAX_ACTIVE_SHELF_BYTES) * 100));

  return {
    isR2Enabled: true,
    totalCachedBytes: totalBytes,
    maxCapacityBytes: MAX_ACTIVE_SHELF_BYTES,
    usagePercent,
    cachedCount: objects.length,
    books: shelfBooks,
  };
}

/**
 * Evicts least recently used audiobooks from R2 to maintain the 8.5 GB high-water mark
 */
export async function evictLruBooks(
  requiredHeadroomBytes: number,
  env: Env,
  customDb?: Database,
): Promise<EvictionResult> {
  if (!env.R2) {
    return { evictedBookIds: [], freedBytes: 0, reason: "r2_disabled" };
  }

  const { objects, totalBytes } = await listActiveShelfObjects(env.R2);

  // Check if current usage + required headroom exceeds the 8.5 GB cap
  if (totalBytes + requiredHeadroomBytes <= MAX_ACTIVE_SHELF_BYTES) {
    return { evictedBookIds: [], freedBytes: 0 };
  }

  const bytesToFree = totalBytes + requiredHeadroomBytes - MAX_ACTIVE_SHELF_BYTES;
  const db = customDb ?? createDb(env.DB);

  // Fetch active shelf books with their most recent listening / updated timestamp
  const activeBooksWithAccess = await db
    .select({
      id: books.id,
      title: books.title,
      updatedAt: books.updatedAt,
      driveFileId: files.driveFileId,
      sizeBytes: files.sizeBytes,
      lastListenedAt: sql<number>`MAX(COALESCE(${progress.updatedAt}, 0))`,
    })
    .from(books)
    .innerJoin(files, eq(files.bookId, books.id))
    .leftJoin(progress, eq(progress.bookId, books.id))
    .where(eq(books.isActiveShelf, true))
    .groupBy(books.id, files.driveFileId, files.sizeBytes)
    .all();

  // Map drive file ID to R2 object size and uploaded date for fallback
  const r2KeyMap = new Map(objects.map((o) => [o.key, o]));

  // Sort candidates by least recently accessed (oldest timestamp first)
  activeBooksWithAccess.sort((a, b) => {
    const timeA = Math.max(
      a.lastListenedAt || 0,
      a.updatedAt ? new Date(a.updatedAt).getTime() : 0,
    );
    const timeB = Math.max(
      b.lastListenedAt || 0,
      b.updatedAt ? new Date(b.updatedAt).getTime() : 0,
    );
    return timeA - timeB;
  });

  const evictedBookIds: string[] = [];
  let freedBytes = 0;

  for (const candidate of activeBooksWithAccess) {
    if (freedBytes >= bytesToFree) {
      break;
    }

    const r2Key = `${ACTIVE_SHELF_PREFIX}${candidate.driveFileId}`;
    const r2Obj = r2KeyMap.get(r2Key);

    if (r2Obj) {
      await env.R2.delete(r2Key);
      freedBytes += r2Obj.size;
    } else {
      freedBytes += candidate.sizeBytes;
    }

    // Mark book as inactive shelf in D1
    await db
      .update(books)
      .set({
        isActiveShelf: false,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(books.id, candidate.id));

    evictedBookIds.push(candidate.id);
  }

  // If D1 had no records but R2 has orphaned objects exceeding limit, delete oldest R2 objects
  if (freedBytes < bytesToFree && objects.length > 0) {
    const unevictedObjects = objects
      .filter((o) => !evictedBookIds.includes(o.bookId || ""))
      .sort((a, b) => a.uploaded.getTime() - b.uploaded.getTime());

    for (const orphan of unevictedObjects) {
      if (freedBytes >= bytesToFree) break;
      await env.R2.delete(orphan.key);
      freedBytes += orphan.size;
      if (orphan.bookId) {
        evictedBookIds.push(orphan.bookId);
      }
    }
  }

  return { evictedBookIds, freedBytes };
}

/**
 * Pre-caches an audiobook from Google Drive to Cloudflare R2 Active Shelf
 */
export async function precacheBookToR2(
  bookId: string,
  env: Env,
  customFetch: typeof fetch = fetch,
  customDb?: Database,
): Promise<PrecacheResult> {
  if (!env.R2) {
    return { success: false, reason: "r2_disabled" };
  }

  const db = customDb ?? createDb(env.DB);
  const book = await db.query.books.findFirst({
    where: eq(books.id, bookId),
    with: { files: true },
  });

  if (!book) {
    return { success: false, reason: "book_not_found" };
  }

  // Find primary audio file for this book
  const file = book.files[0];
  if (!file) {
    return { success: false, reason: "no_audio_file" };
  }

  const r2Key = `${ACTIVE_SHELF_PREFIX}${file.driveFileId}`;
  const fileSize = file.sizeBytes || book.fileSizeBytes;

  if (fileSize > MAX_ACTIVE_SHELF_BYTES) {
    return { success: false, reason: "file_exceeds_max_capacity" };
  }

  // 1. Check if already cached in R2
  const existing = await env.R2.head(r2Key);
  if (existing && existing.size === fileSize) {
    await db
      .update(books)
      .set({
        isActiveShelf: true,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(books.id, bookId));

    return {
      success: true,
      alreadyCached: true,
      bookId,
      bytesCached: fileSize,
    };
  }

  // 2. Enforce 8.5 GB high-water mark via LRU eviction before copying
  await evictLruBooks(fileSize, env, db);

  // 3. Obtain Google OAuth2 access token
  if (!env.GOOGLE_SA_KEY) {
    return { success: false, reason: "google_credentials_missing" };
  }

  const accessToken = await getGoogleAccessToken(env.GOOGLE_SA_KEY, env.KV, customFetch);

  // 4. Stream audio directly from Google Drive API
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${file.driveFileId}?alt=media`;
  const driveResponse = await customFetch(driveUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!driveResponse.ok || !driveResponse.body) {
    return {
      success: false,
      reason: `drive_download_failed_${driveResponse.status}`,
    };
  }

  // 5. Store stream in R2 with custom metadata
  await env.R2.put(r2Key, driveResponse.body, {
    httpMetadata: {
      contentType: file.mimeType || "audio/mp4",
    },
    customMetadata: {
      bookId: book.id,
      driveFileId: file.driveFileId,
      title: book.title,
      cachedAt: Date.now().toString(),
      lastAccessedAt: Date.now().toString(),
    },
  });

  // 6. Mark book as active shelf in D1
  await db
    .update(books)
    .set({
      isActiveShelf: true,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(books.id, bookId));

  return {
    success: true,
    alreadyCached: false,
    bookId,
    bytesCached: fileSize,
  };
}

export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Dispatches an Active Shelf pre-cache or eviction task via Cloudflare Queue
 * or falls back to background execution (ctx.waitUntil) for zero-cost operation.
 */
export async function dispatchShelfTask(
  env: Env,
  message: ShelfQueueMessage,
  ctx?: WaitUntilContext,
): Promise<{ dispatched: boolean; method: "queue" | "waitUntil" | "sync" }> {
  if (env.SHELF_QUEUE) {
    try {
      await env.SHELF_QUEUE.send(message);
      return { dispatched: true, method: "queue" };
    } catch {
      // Fallback to waitUntil if queue send fails
    }
  }

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(
      (async () => {
        if (message.type === "precache" && message.bookId) {
          await precacheBookToR2(message.bookId, env);
        } else if (message.type === "evict") {
          await evictLruBooks(message.requiredBytes || 0, env);
        }
      })(),
    );
    return { dispatched: true, method: "waitUntil" };
  }

  // Non-blocking background promise
  if (message.type === "precache" && message.bookId) {
    precacheBookToR2(message.bookId, env).catch(() => {});
  } else if (message.type === "evict") {
    evictLruBooks(message.requiredBytes || 0, env).catch(() => {});
  }

  return { dispatched: true, method: "sync" };
}

/**
 * Consumer handler for Cloudflare Queue batches (if Queues are enabled)
 */
export async function handleQueueBatch(
  batch: MessageBatch<ShelfQueueMessage>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      if (message.body.type === "precache" && message.body.bookId) {
        await precacheBookToR2(message.body.bookId, env);
      } else if (message.body.type === "evict") {
        await evictLruBooks(message.body.requiredBytes || 0, env);
      }
      message.ack();
    } catch {
      message.retry();
    }
  }
}
