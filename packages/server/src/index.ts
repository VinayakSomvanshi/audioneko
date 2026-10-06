import { createHlc, type BookProgressRecord } from "@audioneko/shared";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { absRoutes } from "./abs/routes";
import { adminRoutes } from "./admin/routes";
import { createAuth } from "./auth";
import { type AuthContextVariables, requireAdmin, requireAuth } from "./auth/middleware";
import { inviteRoutes } from "./auth/routes";
import { createDb } from "./db";
import * as schema from "./db/schema";
import { enrichAuthorMetadata } from "./drive/author-enrich";
import { extractChaptersFromM4b } from "./drive/metadata";
import { scanDriveLibrary } from "./drive/scanner";
import { handleAudioStreamRequest } from "./drive/stream";
import { getGoogleAccessToken } from "./drive/token";
import {
  getActiveDriveWatchChannel,
  handleDrivePushNotification,
  registerDriveWatchChannel,
} from "./drive/webhook";
import {
  ACTIVE_SHELF_PREFIX,
  dispatchShelfTask,
  evictLruBooks,
  getActiveShelfStatus,
  handleQueueBatch,
} from "./shelf/active-shelf";
import { getUserListeningAnalytics, recordListeningEvent } from "./social/analytics";
import { ListenAlongRoom } from "./social/listen-along";
import { getFriendsPresence } from "./social/presence";
import { SyncRoom } from "./sync/room";
import type { Env, ShelfQueueMessage } from "./types";

const app = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-token",
      "Range",
      "Upgrade",
      "Sec-WebSocket-Key",
      "Sec-WebSocket-Version",
      "Sec-WebSocket-Extensions",
    ],
    exposeHeaders: [
      "Content-Range",
      "Accept-Ranges",
      "Content-Length",
      "Content-Type",
      "ETag",
      "x-token",
      "X-Audioneko-Tier",
      "X-Audioneko-Source",
    ],
    credentials: true,
    maxAge: 86400,
  }),
);

// Global uncaught exception handler
app.onError((err, c) => {
  console.error(`[audioneko:error] ${c.req.method} ${c.req.url}:`, err);
  return c.json(
    {
      error: err.message || "Internal Server Error",
      code: "INTERNAL_ERROR",
      status: 500,
    },
    500,
  );
});

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({ status: "healthy", timestamp: Date.now() });
});

// Better Auth routes handler (/api/auth/*)
app.all("/api/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// Cryptographic invite routes (/api/invites/*)
app.route("/api/invites", inviteRoutes);

// Admin Control Plane routes (/api/admin/*)
app.route("/api/admin", adminRoutes);

export interface ResolvedFileInfo {
  driveFileId: string;
  sizeBytes: number;
  mimeType: string;
  name: string;
}

const fileInfoCache = new Map<string, ResolvedFileInfo>();

export function _resetFileInfoCache(): void {
  fileInfoCache.clear();
}

// Resolve fileId: if it's a book ID or file ID, map to Google Drive file ID & metadata from files table
async function resolveDriveFileInfo(
  db: ReturnType<typeof createDb>,
  param: string,
): Promise<ResolvedFileInfo> {
  const cached = fileInfoCache.get(param);
  if (cached) return cached;

  const fileRecord = await db
    .select({
      driveFileId: schema.files.driveFileId,
      sizeBytes: schema.files.sizeBytes,
      mimeType: schema.files.mimeType,
      name: schema.files.name,
    })
    .from(schema.files)
    .where(
      or(
        eq(schema.files.bookId, param),
        eq(schema.files.id, param),
        eq(schema.files.driveFileId, param),
      ),
    )
    .limit(1);

  const resolved: ResolvedFileInfo = fileRecord[0]
    ? {
        driveFileId: fileRecord[0].driveFileId,
        sizeBytes: fileRecord[0].sizeBytes,
        mimeType: fileRecord[0].mimeType,
        name: fileRecord[0].name,
      }
    : {
        driveFileId: param,
        sizeBytes: 0,
        mimeType: "audio/mp4",
        name: "audiobook.m4b",
      };

  if (fileInfoCache.size > 2000) fileInfoCache.clear();
  fileInfoCache.set(param, resolved);
  if (resolved.driveFileId !== param) {
    fileInfoCache.set(resolved.driveFileId, resolved);
  }
  return resolved;
}

// Audio streaming range proxy endpoint (GET and HEAD) - Protected by requireAuth
app.get("/api/stream/:fileId", requireAuth, async (c) => {
  const fileId = c.req.param("fileId");
  const db = createDb(c.env.DB);
  const fileInfo = await resolveDriveFileInfo(db, fileId);
  const preloadedMeta =
    fileInfo.sizeBytes > 0
      ? {
          size: fileInfo.sizeBytes,
          mimeType: fileInfo.mimeType,
          name: fileInfo.name,
        }
      : undefined;
  return handleAudioStreamRequest(c.req.raw, fileInfo.driveFileId, c.env, fetch, preloadedMeta);
});

app.on("HEAD", "/api/stream/:fileId", requireAuth, async (c) => {
  const fileId = c.req.param("fileId");
  const db = createDb(c.env.DB);
  const fileInfo = await resolveDriveFileInfo(db, fileId);
  const preloadedMeta =
    fileInfo.sizeBytes > 0
      ? {
          size: fileInfo.sizeBytes,
          mimeType: fileInfo.mimeType,
          name: fileInfo.name,
        }
      : undefined;
  return handleAudioStreamRequest(c.req.raw, fileInfo.driveFileId, c.env, fetch, preloadedMeta);
});

// Library Books API - Protected by requireAuth
app.get("/api/books", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const allBooks = await db
    .select({
      id: schema.books.id,
      driveFolderId: schema.books.driveFolderId,
      title: schema.books.title,
      author: schema.books.author,
      seriesId: schema.books.seriesId,
      seriesIndex: schema.books.seriesIndex,
      narrator: schema.books.narrator,
      description: schema.books.description,
      coverR2Key: schema.books.coverR2Key,
      durationSeconds: schema.books.durationSeconds,
      publishedYear: schema.books.publishedYear,
      format: schema.books.format,
      fileSizeBytes: schema.books.fileSizeBytes,
      isActiveShelf: schema.books.isActiveShelf,
      createdAt: schema.books.createdAt,
      updatedAt: schema.books.updatedAt,
      seriesName: schema.series.name,
    })
    .from(schema.books)
    .leftJoin(schema.series, eq(schema.books.seriesId, schema.series.id));

  const mapped = allBooks.map((b) => ({
    ...b,
    series: b.seriesName || undefined,
  }));
  return c.json({ books: mapped });
});

app.get("/api/books/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env.DB);
  const bookList = await db.select().from(schema.books).where(eq(schema.books.id, id)).limit(1);

  if (!bookList[0]) {
    return c.json({ error: "Book not found" }, 404);
  }

  const bookFiles = await db.select().from(schema.files).where(eq(schema.files.bookId, id));

  let bookChapters = await db
    .select()
    .from(schema.chapters)
    .where(eq(schema.chapters.bookId, id))
    .orderBy(asc(schema.chapters.chapterIndex));

  // If this book only has 1 placeholder chapter and it's an M4B file, try on-demand extraction
  if (bookChapters.length <= 1 && bookList[0].format === "m4b" && c.env.GOOGLE_SA_KEY) {
    try {
      const primaryDriveId = bookFiles[0]?.driveFileId || bookList[0].driveFolderId;
      const sizeBytes = bookFiles[0]?.sizeBytes || bookList[0].fileSizeBytes || 0;
      if (primaryDriveId && sizeBytes > 0) {
        const token = await getGoogleAccessToken(c.env.GOOGLE_SA_KEY, c.env.KV);
        const extracted = await extractChaptersFromM4b(token, primaryDriveId, sizeBytes);
        if (extracted.length > 0) {
          await db.delete(schema.chapters).where(eq(schema.chapters.bookId, id));
          const chapterRows = extracted.map((ch) => ({
            id: `ch_${id}_${ch.index}`,
            bookId: id,
            chapterIndex: ch.index,
            title: ch.title,
            startTime: ch.startTimeSeconds,
            endTime: ch.endTimeSeconds,
            duration: ch.durationSeconds,
          }));
          for (let i = 0; i < chapterRows.length; i += 10) {
            await db.insert(schema.chapters).values(chapterRows.slice(i, i + 10));
          }
          bookChapters = await db
            .select()
            .from(schema.chapters)
            .where(eq(schema.chapters.bookId, id))
            .orderBy(asc(schema.chapters.chapterIndex));
        }
      }
    } catch (err) {
      console.warn(`[api/books/:id] On-demand chapter extraction failed for ${id}:`, err);
    }
  }

  return c.json({
    book: bookList[0],
    files: bookFiles,
    chapters: bookChapters,
  });
});

// Series API: Returns all series with their books in chronological order - Protected by requireAuth
app.get("/api/series", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const allSeries = await db.select().from(schema.series);
  const allBooks = await db
    .select({
      id: schema.books.id,
      title: schema.books.title,
      author: schema.books.author,
      seriesId: schema.books.seriesId,
      seriesIndex: schema.books.seriesIndex,
      durationSeconds: schema.books.durationSeconds,
      coverR2Key: schema.books.coverR2Key,
      narrator: schema.books.narrator,
      publishedYear: schema.books.publishedYear,
      format: schema.books.format,
      isActiveShelf: schema.books.isActiveShelf,
      seriesName: schema.series.name,
    })
    .from(schema.books)
    .leftJoin(schema.series, eq(schema.books.seriesId, schema.series.id));

  const seriesMap = new Map<
    string,
    {
      id: string;
      name: string;
      description: string | null;
      primaryAuthor: string;
      bookCount: number;
      totalDurationSeconds: number;
      books: Array<(typeof allBooks)[number] & { series?: string }>;
    }
  >();

  for (const s of allSeries) {
    seriesMap.set(s.id, {
      id: s.id,
      name: s.name,
      description: s.description,
      primaryAuthor: "",
      bookCount: 0,
      totalDurationSeconds: 0,
      books: [],
    });
  }

  for (const b of allBooks) {
    const mappedBook = { ...b, series: b.seriesName || undefined };
    if (b.seriesId && seriesMap.has(b.seriesId)) {
      const entry = seriesMap.get(b.seriesId)!;
      entry.books.push(mappedBook);
      entry.bookCount++;
      entry.totalDurationSeconds += b.durationSeconds || 0;
      if (!entry.primaryAuthor && b.author) {
        entry.primaryAuthor = b.author;
      }
    }
  }

  const seriesList = Array.from(seriesMap.values())
    .filter((s) => s.books.length > 0)
    .map((s) => {
      // Sort in strict chronological order by series index (unnumbered/spinoffs at end)
      s.books.sort((a, b) => (a.seriesIndex ?? 9999) - (b.seriesIndex ?? 9999));
      return s;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return c.json({ series: seriesList });
});

// Authors API: Returns all authors with their books and series information - Protected by requireAuth
app.get("/api/authors", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const allBooks = await db
    .select({
      id: schema.books.id,
      title: schema.books.title,
      author: schema.books.author,
      seriesId: schema.books.seriesId,
      seriesIndex: schema.books.seriesIndex,
      durationSeconds: schema.books.durationSeconds,
      coverR2Key: schema.books.coverR2Key,
      narrator: schema.books.narrator,
      publishedYear: schema.books.publishedYear,
      format: schema.books.format,
      isActiveShelf: schema.books.isActiveShelf,
      seriesName: schema.series.name,
    })
    .from(schema.books)
    .leftJoin(schema.series, eq(schema.books.seriesId, schema.series.id));

  const authorMap = new Map<
    string,
    {
      name: string;
      bookCount: number;
      seriesCount: number;
      seriesNames: string[];
      totalDurationSeconds: number;
      books: Array<(typeof allBooks)[number] & { series?: string }>;
    }
  >();

  for (const b of allBooks) {
    const authorName = b.author?.trim() || "Unknown Author";
    const mappedBook = { ...b, series: b.seriesName || undefined };
    if (!authorMap.has(authorName)) {
      authorMap.set(authorName, {
        name: authorName,
        bookCount: 0,
        seriesCount: 0,
        seriesNames: [],
        totalDurationSeconds: 0,
        books: [],
      });
    }
    const entry = authorMap.get(authorName)!;
    entry.books.push(mappedBook);
    entry.bookCount++;
    entry.totalDurationSeconds += b.durationSeconds || 0;
    if (b.seriesName && !entry.seriesNames.includes(b.seriesName)) {
      entry.seriesNames.push(b.seriesName);
    }
  }

  const authorsList = await Promise.all(
    Array.from(authorMap.values()).map(async (a) => {
      a.seriesCount = a.seriesNames.length;
      // Sort books: first by series name, then by seriesIndex, then title
      a.books.sort((x, y) => {
        if (x.seriesName && y.seriesName && x.seriesName === y.seriesName) {
          return (x.seriesIndex ?? 9999) - (y.seriesIndex ?? 9999);
        }
        if (x.seriesName && !y.seriesName) return -1;
        if (!x.seriesName && y.seriesName) return 1;
        return x.title.localeCompare(y.title);
      });

      const meta = await enrichAuthorMetadata(a.name, c.env);
      return {
        ...a,
        photoUrl: meta.photoUrl,
        bio: meta.bio,
        birthDate: meta.birthDate,
        topWork: meta.topWork,
        openLibraryKey: meta.openLibraryKey,
      };
    }),
  );

  authorsList.sort((a, b) => a.name.localeCompare(b.name));

  return c.json({ authors: authorsList });
});

// Single Author Profile Ingestion Endpoint
app.get("/api/authors/:name", requireAuth, async (c) => {
  const authorName = decodeURIComponent(c.req.param("name"));
  const profile = await enrichAuthorMetadata(authorName, c.env);
  return c.json({ profile });
});

// Book Cover Proxy endpoint
app.get("/api/covers/:bookId", async (c) => {
  const bookId = c.req.param("bookId");
  const db = createDb(c.env.DB);
  const bookRecord = await db
    .select({ coverR2Key: schema.books.coverR2Key })
    .from(schema.books)
    .where(eq(schema.books.id, bookId))
    .limit(1);

  const coverKey = bookRecord[0]?.coverR2Key;
  if (!coverKey) {
    return c.text("Cover not found", 404);
  }

  if (coverKey.startsWith("http://") || coverKey.startsWith("https://")) {
    c.header("Cache-Control", "public, max-age=604800, s-maxage=604800");
    return c.redirect(coverKey, 302);
  }

  if (coverKey.startsWith("/")) {
    if (c.env.ASSETS) {
      const assetUrl = new URL(coverKey, c.req.url);
      const res = await c.env.ASSETS.fetch(new Request(assetUrl.toString()));
      if (res.status === 200) {
        const headers = new Headers(res.headers);
        headers.set("Cache-Control", "public, max-age=604800, s-maxage=604800");
        return new Response(res.body, {
          status: 200,
          headers,
        });
      }
    }
  }

  if (coverKey.startsWith("gdrive:")) {
    const driveFileId = coverKey.replace("gdrive:", "");
    const cache =
      typeof caches !== "undefined" && "default" in caches
        ? (caches as unknown as { default: Cache }).default
        : null;
    const cacheKey = new Request(c.req.url, { method: "GET" });

    if (cache) {
      const cachedRes = await cache.match(cacheKey);
      if (cachedRes) {
        return cachedRes;
      }
    }

    if (!c.env.GOOGLE_SA_KEY) {
      return c.text("Google Drive credentials missing", 500);
    }
    const token = await getGoogleAccessToken(c.env.GOOGLE_SA_KEY, c.env.KV);
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!driveRes.ok) {
      return new Response("Failed to fetch cover from Drive", { status: driveRes.status });
    }

    const contentType = driveRes.headers.get("content-type") || "image/png";
    const response = new Response(driveRes.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, s-maxage=604800",
      },
    });

    if (cache) {
      c.executionCtx?.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  }

  if (c.env.R2) {
    const r2Obj = await c.env.R2.get(coverKey);
    if (r2Obj && "body" in r2Obj && r2Obj.body) {
      return new Response(r2Obj.body as ReadableStream, {
        headers: {
          "Content-Type": r2Obj.httpMetadata?.contentType || "image/jpeg",
          "Cache-Control": "public, max-age=604800, s-maxage=604800",
        },
      });
    }
  }

  return c.text("Cover not found", 404);
});

// Google Drive Library Scanner endpoint - Admin only
app.post("/api/library/scan", requireAuth, requireAdmin, async (c) => {
  try {
    let folderId = c.env.GOOGLE_DRIVE_FOLDER_ID || "1Eb41o9yGeJoojEYniUZvRCjaxBziLN-Z";
    const bodyRaw = await c.req
      .json<{ folderId?: string }>()
      .catch(() => ({}) as { folderId?: string });
    if (bodyRaw.folderId) {
      folderId = bodyRaw.folderId;
    }

    const result = await scanDriveLibrary(c.env, folderId);
    return c.json(result);
  } catch (err) {
    console.error("Library scan failed:", err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// Real-time WebSocket sync route (/api/sync/ws)
app.get("/api/sync/ws", requireAuth, async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.text("Expected Upgrade: websocket", 426);
  }

  const user = c.get("user");
  if (!user?.id) {
    return c.text("Unauthorized", 401);
  }

  // Derive Durable Object ID deterministically from user ID
  const doId = c.env.SYNC_ROOM.idFromName(user.id);
  const stub = c.env.SYNC_ROOM.get(doId);

  return stub.fetch(c.req.raw);
});

// REST sync progress state endpoint (/api/sync/state)
app.get("/api/sync/state", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const doId = c.env.SYNC_ROOM.idFromName(user.id);
  const stub = c.env.SYNC_ROOM.get(doId);

  const res = await stub.fetch(new Request("https://sync/state"));
  const doData = (await res.json().catch(() => ({ books: [] }))) as {
    books?: BookProgressRecord[];
  };

  // Reconcile with D1 progress table to ensure all mobile/ABS and external sessions are included
  const db = createDb(c.env.DB);
  const d1Rows = await db.query.progress.findMany({
    where: eq(schema.progress.userId, user.id),
  });

  const mergedMap = new Map<string, BookProgressRecord>();
  for (const b of doData.books || []) {
    mergedMap.set(b.bookId, b);
  }

  for (const row of d1Rows) {
    const existing = mergedMap.get(row.bookId);
    const rowUpdatedAtMs = (row.updatedAt || 0) * 1000;
    if (!existing || rowUpdatedAtMs > (existing.updatedAt || 0)) {
      mergedMap.set(row.bookId, {
        bookId: row.bookId,
        currentTime: row.currentTimeSeconds || 0,
        duration: row.durationSeconds || existing?.duration || 0,
        playbackRate: existing?.playbackRate || 1.0,
        isPlaying: false,
        hlc: existing?.hlc || createHlc("mobile_abs", rowUpdatedAtMs),
        deviceId: existing?.deviceId || "mobile_abs",
        deviceName: existing?.deviceName || "Mobile / Audiobookshelf",
        updatedAt: rowUpdatedAtMs,
      });
    }
  }

  const books = Array.from(mergedMap.values()).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  );
  return c.json({ books });
});

// REST endpoint to delete / reset progress for a book
app.delete("/api/sync/progress/:bookId", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const bookId = c.req.param("bookId");
  const doId = c.env.SYNC_ROOM.idFromName(user.id);
  const stub = c.env.SYNC_ROOM.get(doId);

  const res = await stub.fetch(
    new Request(`https://sync/progress/${encodeURIComponent(bookId)}`, { method: "DELETE" }),
  );
  return c.newResponse(res.body, res.status as 200, Object.fromEntries(res.headers.entries()));
});

// ==========================================
// Cloudflare R2 "Active Shelf" Cache Routes
// ==========================================

// Get current Active Shelf status, total size, and cached books
app.get("/api/shelf/status", requireAuth, async (c) => {
  const status = await getActiveShelfStatus(c.env);
  return c.json(status);
});

// Pre-cache an audiobook to R2 Active Shelf
app.post("/api/shelf/precache/:bookId", requireAuth, async (c) => {
  if (!c.env.R2) {
    return c.json(
      {
        error:
          "Active Shelf is currently in Direct Google Drive Mode. Cloudflare R2 is not configured on this deployment. Audiobooks stream directly via Edge Cache and Google Drive.",
        code: "r2_disabled",
        isR2Enabled: false,
      },
      400,
    );
  }
  const bookId = c.req.param("bookId");
  const result = await dispatchShelfTask(
    c.env,
    { type: "precache", bookId, timestamp: Date.now() },
    c.executionCtx,
  );
  return c.json({ success: true, bookId, method: result.method });
});

// Trigger LRU eviction check (Admin only)
app.post("/api/shelf/evict", requireAuth, requireAdmin, async (c) => {
  if (!c.env.R2) {
    return c.json({ evictedBookIds: [], freedBytes: 0, reason: "r2_disabled" });
  }
  const body = (await c.req.json().catch(() => ({}))) as { requiredBytes?: number };
  const requiredBytes = typeof body.requiredBytes === "number" ? body.requiredBytes : 0;
  const result = await evictLruBooks(requiredBytes, c.env);
  return c.json(result);
});

// Remove a specific book from R2 Active Shelf (Admin only)
app.delete("/api/shelf/:bookId", requireAuth, requireAdmin, async (c) => {
  const bookId = c.req.param("bookId");
  const db = createDb(c.env.DB);
  const book = await db.query.books.findFirst({
    where: eq(schema.books.id, bookId),
    with: { files: true },
  });

  if (!book) {
    return c.json({ error: "Book not found" }, 404);
  }

  if (c.env.R2 && book.files[0]?.driveFileId) {
    await c.env.R2.delete(`${ACTIVE_SHELF_PREFIX}${book.files[0].driveFileId}`);
  }

  await db
    .update(schema.books)
    .set({
      isActiveShelf: false,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(schema.books.id, bookId));

  return c.json({ success: true, bookId });
});

// ==========================================
// Custom User Shelves / Collections Routes
// ==========================================

// Get user's custom shelves with their contained books
app.get("/api/shelves", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return c.json({ shelves: [] });
  }
  const db = createDb(c.env.DB);
  const userShelves = await db
    .select()
    .from(schema.shelves)
    .where(eq(schema.shelves.userId, user.id));

  const allItems = await db
    .select({
      id: schema.shelfItems.id,
      shelfId: schema.shelfItems.shelfId,
      bookId: schema.shelfItems.bookId,
      orderIndex: schema.shelfItems.orderIndex,
      addedAt: schema.shelfItems.addedAt,
      bookTitle: schema.books.title,
      bookAuthor: schema.books.author,
      coverR2Key: schema.books.coverR2Key,
      durationSeconds: schema.books.durationSeconds,
      format: schema.books.format,
    })
    .from(schema.shelfItems)
    .leftJoin(schema.books, eq(schema.shelfItems.bookId, schema.books.id));

  const shelvesWithItems = userShelves.map((s) => ({
    ...s,
    items: allItems.filter((i) => i.shelfId === s.id),
  }));

  return c.json({ shelves: shelvesWithItems });
});

// Create a new custom shelf
app.post("/api/shelves", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name: string }>().catch(() => ({ name: "" }));
  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: "Shelf name is required" }, 400);
  }
  const db = createDb(c.env.DB);
  const newShelf = {
    id: `sh_${crypto.randomUUID()}`,
    userId: user.id,
    name,
    isPublic: false,
    createdAt: Math.floor(Date.now() / 1000),
  };
  await db.insert(schema.shelves).values(newShelf);
  return c.json({ success: true, shelf: { ...newShelf, items: [] } });
});

// Delete a custom shelf
app.delete("/api/shelves/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const shelfId = c.req.param("id");
  const db = createDb(c.env.DB);
  await db
    .delete(schema.shelves)
    .where(and(eq(schema.shelves.id, shelfId), eq(schema.shelves.userId, user.id)));
  return c.json({ success: true });
});

// Add a book to a custom shelf
app.post("/api/shelves/:id/books", requireAuth, async (c) => {
  const user = c.get("user");
  const shelfId = c.req.param("id");
  const body = await c.req.json<{ bookId: string }>().catch(() => ({ bookId: "" }));
  if (!body.bookId) {
    return c.json({ error: "Book ID required" }, 400);
  }
  const db = createDb(c.env.DB);
  const shelf = await db
    .select()
    .from(schema.shelves)
    .where(and(eq(schema.shelves.id, shelfId), eq(schema.shelves.userId, user.id)))
    .limit(1);
  if (!shelf[0]) {
    return c.json({ error: "Shelf not found" }, 404);
  }
  await db
    .insert(schema.shelfItems)
    .values({
      id: `shi_${crypto.randomUUID()}`,
      shelfId,
      bookId: body.bookId,
      orderIndex: 0,
      addedAt: Math.floor(Date.now() / 1000),
    })
    .onConflictDoNothing();
  return c.json({ success: true });
});

// Remove a book from a custom shelf
app.delete("/api/shelves/:id/books/:bookId", requireAuth, async (c) => {
  const user = c.get("user");
  const shelfId = c.req.param("id");
  const bookId = c.req.param("bookId");
  const db = createDb(c.env.DB);
  const shelf = await db
    .select()
    .from(schema.shelves)
    .where(and(eq(schema.shelves.id, shelfId), eq(schema.shelves.userId, user.id)))
    .limit(1);
  if (!shelf[0]) {
    return c.json({ error: "Shelf not found" }, 404);
  }
  await db
    .delete(schema.shelfItems)
    .where(and(eq(schema.shelfItems.shelfId, shelfId), eq(schema.shelfItems.bookId, bookId)));
  return c.json({ success: true });
});

// ==========================================
// Bookmarks API Routes
// ==========================================
// Bookmarks, Clips & Shelves Routes
// ==========================================

// Get all bookmarks across all books for authenticated user
app.get("/api/bookmarks", requireAuth, async (c) => {
  try {
    const user = c.get("user");
    const db = createDb(c.env.DB);
    const userBookmarks = await db
      .select({
        id: schema.bookmarks.id,
        bookId: schema.bookmarks.bookId,
        positionSeconds: schema.bookmarks.positionSeconds,
        chapterTitle: schema.bookmarks.chapterTitle,
        note: schema.bookmarks.note,
        createdAt: schema.bookmarks.createdAt,
        bookTitle: schema.books.title,
        bookAuthor: schema.books.author,
        coverR2Key: schema.books.coverR2Key,
      })
      .from(schema.bookmarks)
      .leftJoin(schema.books, eq(schema.bookmarks.bookId, schema.books.id))
      .where(eq(schema.bookmarks.userId, user.id))
      .orderBy(desc(schema.bookmarks.createdAt));
    return c.json({ bookmarks: userBookmarks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch bookmarks";
    return c.json({ error: message, code: "BOOKMARKS_FETCH_FAILED" }, 500);
  }
});

// Export all bookmarks to Markdown format
app.get("/api/bookmarks/export/markdown", requireAuth, async (c) => {
  try {
    const user = c.get("user");
    const db = createDb(c.env.DB);
    const userBookmarks = await db
      .select({
        id: schema.bookmarks.id,
        bookId: schema.bookmarks.bookId,
        positionSeconds: schema.bookmarks.positionSeconds,
        chapterTitle: schema.bookmarks.chapterTitle,
        note: schema.bookmarks.note,
        createdAt: schema.bookmarks.createdAt,
        bookTitle: schema.books.title,
        bookAuthor: schema.books.author,
      })
      .from(schema.bookmarks)
      .leftJoin(schema.books, eq(schema.bookmarks.bookId, schema.books.id))
      .where(eq(schema.bookmarks.userId, user.id))
      .orderBy(asc(schema.books.title), asc(schema.bookmarks.positionSeconds));

    const booksMap = new Map<string, typeof userBookmarks>();
    for (const b of userBookmarks) {
      const key = b.bookTitle || "Unknown Audiobook";
      if (!booksMap.has(key)) {
        booksMap.set(key, []);
      }
      booksMap.get(key)!.push(b);
    }

    const formatTimestamp = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    let md = "# audioneko: Audiobook Highlights & Annotations\n\n";
    for (const [title, marks] of booksMap.entries()) {
      const author = marks[0]?.bookAuthor || "Unknown Author";
      md += `## ${title}\n*By ${author}*\n\n`;
      for (const m of marks) {
        const timeCode = formatTimestamp(m.positionSeconds);
        const chapter = m.chapterTitle ? ` (${m.chapterTitle})` : "";
        const note = m.note ? ` - "${m.note}"` : "";
        md += `- **${timeCode}**${chapter}${note}\n`;
      }
      md += "\n";
    }

    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Content-Disposition", 'attachment; filename="audioneko-highlights.md"');
    return c.text(md);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to export markdown";
    return c.json({ error: message, code: "BOOKMARKS_EXPORT_FAILED" }, 500);
  }
});

// Update a bookmark note by ID
app.patch("/api/bookmarks/:id", requireAuth, async (c) => {
  try {
    const user = c.get("user");
    const bookmarkId = c.req.param("id");
    const { note } = await c.req.json<{ note: string }>();
    const db = createDb(c.env.DB);

    await db
      .update(schema.bookmarks)
      .set({ note: note || null })
      .where(and(eq(schema.bookmarks.id, bookmarkId), eq(schema.bookmarks.userId, user.id)));

    return c.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update bookmark";
    return c.json({ error: message, code: "BOOKMARK_UPDATE_FAILED" }, 500);
  }
});

// Get all bookmarks for a specific book by authenticated user
app.get("/api/bookmarks/:bookId", requireAuth, async (c) => {
  try {
    const user = c.get("user");
    const bookId = c.req.param("bookId");
    if (!bookId) {
      return c.json({ error: "Missing required parameter: bookId" }, 400);
    }
    const db = createDb(c.env.DB);
    const userBookmarks = await db
      .select()
      .from(schema.bookmarks)
      .where(and(eq(schema.bookmarks.userId, user.id), eq(schema.bookmarks.bookId, bookId)))
      .orderBy(asc(schema.bookmarks.positionSeconds));
    return c.json({ bookmarks: userBookmarks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch bookmarks";
    return c.json({ error: message, code: "BOOKMARKS_FETCH_FAILED" }, 500);
  }
});

// Create a new bookmark at current audio position
app.post("/api/bookmarks", requireAuth, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req
      .json<{
        bookId: string;
        positionSeconds: number;
        chapterTitle?: string;
        note?: string;
      }>()
      .catch(() => null);

    if (
      !body ||
      !body.bookId ||
      typeof body.bookId !== "string" ||
      body.positionSeconds === undefined ||
      !Number.isFinite(body.positionSeconds) ||
      body.positionSeconds < 0
    ) {
      return c.json(
        { error: "Missing required fields: bookId, positionSeconds (must be non-negative number)" },
        400,
      );
    }

    const db = createDb(c.env.DB);
    const bookmarkId = `bm_${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);
    const sanitizedChapter = body.chapterTitle ? String(body.chapterTitle).slice(0, 255) : null;
    const sanitizedNote = body.note ? String(body.note).slice(0, 2000) : null;
    const sanitizedPos = Math.max(0, body.positionSeconds);

    await db.insert(schema.bookmarks).values({
      id: bookmarkId,
      userId: user.id,
      bookId: body.bookId,
      positionSeconds: sanitizedPos,
      chapterTitle: sanitizedChapter,
      note: sanitizedNote,
      createdAt: now,
    });

    return c.json(
      {
        id: bookmarkId,
        userId: user.id,
        bookId: body.bookId,
        positionSeconds: sanitizedPos,
        chapterTitle: sanitizedChapter,
        note: sanitizedNote,
        createdAt: now,
      },
      201,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create bookmark";
    return c.json({ error: message, code: "BOOKMARK_CREATE_FAILED" }, 500);
  }
});

// Delete a bookmark by ID
app.delete("/api/bookmarks/:id", requireAuth, async (c) => {
  try {
    const user = c.get("user");
    const bookmarkId = c.req.param("id");
    if (!bookmarkId) {
      return c.json({ error: "Missing bookmark ID" }, 400);
    }
    const db = createDb(c.env.DB);

    await db
      .delete(schema.bookmarks)
      .where(and(eq(schema.bookmarks.id, bookmarkId), eq(schema.bookmarks.userId, user.id)));

    return c.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete bookmark";
    return c.json({ error: message, code: "BOOKMARK_DELETE_FAILED" }, 500);
  }
});

// ==========================================
// Google Drive Push Notification Webhooks
// ==========================================

// Google Drive Push Notification Webhook Receiver
app.post("/api/webhooks/drive", async (c) => {
  const headers = {
    channelId: c.req.header("x-goog-channel-id"),
    channelToken: c.req.header("x-goog-channel-token"),
    resourceId: c.req.header("x-goog-resource-id"),
    resourceState: c.req.header("x-goog-resource-state"),
    channelExpiration: c.req.header("x-goog-channel-expiration"),
    messageNumber: c.req.header("x-goog-message-number"),
  };

  const result = await handleDrivePushNotification(headers, c.env);
  return c.json(result, 200);
});

// Admin: Check active Google Drive Watch Channel
app.get("/api/admin/drive/watch", requireAdmin, async (c) => {
  const channel = await getActiveDriveWatchChannel(c.env);
  return c.json({ channel });
});

// Admin: Register or refresh Google Drive Watch Channel
app.post("/api/admin/drive/watch", requireAdmin, async (c) => {
  const result = await registerDriveWatchChannel(c.env, c.env.APP_URL);
  if ("error" in result) {
    return c.json(result, 500);
  }
  return c.json({ success: true, channel: result });
});

// ==========================================
// Listening Analytics & Streaks Routes
// ==========================================

// Record a listening playback event
app.post("/api/analytics/listen", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const db = createDb(c.env.DB);
  const result = await recordListeningEvent(user.id, body, db);
  return c.json(result);
});

// Get user listening statistics, streaks, and 365-day activity heatmap
app.get("/api/analytics/summary", requireAuth, async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const analytics = await getUserListeningAnalytics(user.id, db);
  return c.json(analytics);
});

// ==========================================
// Social Presence Routes
// ==========================================

// Get small-group friends presence and current listening status
app.get("/api/social/presence", requireAuth, async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const presence = await getFriendsPresence(user.id, db);
  return c.json(presence);
});

// ==========================================
// Listen-Along Synchronous Room Routes
// ==========================================

// WebSocket connect to a synchronized listen-along room
app.get("/api/social/rooms/:roomId/ws", requireAuth, async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.text("Expected Upgrade: websocket", 426);
  }

  if (!c.env.LISTEN_ALONG_ROOM) {
    return c.text("ListenAlongRoom Durable Object not bound", 501);
  }

  const roomId = c.req.param("roomId");
  const doId = c.env.LISTEN_ALONG_ROOM.idFromName(roomId);
  const stub = c.env.LISTEN_ALONG_ROOM.get(doId);

  return stub.fetch(c.req.raw);
});

// Get current listen-along room state
app.get("/api/social/rooms/:roomId/state", requireAuth, async (c) => {
  if (!c.env.LISTEN_ALONG_ROOM) {
    return c.json({ error: "ListenAlongRoom Durable Object not bound" }, 501);
  }

  const roomId = c.req.param("roomId");
  const doId = c.env.LISTEN_ALONG_ROOM.idFromName(roomId);
  const stub = c.env.LISTEN_ALONG_ROOM.get(doId);

  const res = await stub.fetch(new Request("https://room/state"));
  return c.newResponse(res.body, res.status as 200, Object.fromEntries(res.headers.entries()));
});

// ==========================================
// Audiobookshelf (ABS) API Compatibility Layer
// Supports Plappa (iOS), ShelfPlayer, and native ABS clients
// ==========================================
app.route("/api/v1", absRoutes);
app.route("/api", absRoutes);
app.route("/", absRoutes);

// Helper to serve index.html with strict no-cache headers to prevent stale chunk errors
async function serveSpaIndexHtml(env: Env, reqUrl: string): Promise<Response> {
  const rootUrl = new URL("/", reqUrl);
  const res = await env.ASSETS.fetch(new Request(rootUrl.toString()));
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

// Fallback: Serve client PWA static assets or SPA shell (/index.html)
app.on(["GET", "HEAD"], "*", async (c) => {
  if (c.env.ASSETS) {
    const url = new URL(c.req.url);
    const pathname = url.pathname;

    // Do not intercept API requests
    if (pathname.startsWith("/api/")) {
      return c.json({ error: "Endpoint not found", code: "NOT_FOUND", status: 404 }, 404);
    }

    // Explicit root or HTML requests: serve fresh index.html with no-cache
    if (pathname === "/" || pathname === "/index.html") {
      return serveSpaIndexHtml(c.env, c.req.url);
    }

    // Explicit hashed Vite assets: /assets/*
    if (pathname.startsWith("/assets/")) {
      const res = await c.env.ASSETS.fetch(c.req.raw);
      if (res.status === 200) {
        const headers = new Headers(res.headers);
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        return new Response(res.body, {
          status: 200,
          statusText: res.statusText,
          headers,
        });
      }
      // CRITICAL: Never return index.html for missing /assets/* — return clean 404
      return new Response("Asset Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-cache, no-store",
        },
      });
    }

    // Service Worker: must never be cached by browser
    if (pathname === "/sw.js") {
      const res = await c.env.ASSETS.fetch(c.req.raw);
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    }

    const lastSegment = pathname.split("/").pop() || "";
    const hasExtension = lastSegment.includes(".");

    // If it's a file with an extension (e.g. /favicon.svg, /manifest.json, etc.)
    if (hasExtension) {
      const res = await c.env.ASSETS.fetch(c.req.raw);
      if (res.status === 200) {
        return res;
      }
      return c.text("Not Found", 404);
    }

    // It's an SPA route without a file extension (e.g. /series, /authors, /shelves, /book/123)
    return serveSpaIndexHtml(c.env, c.req.url);
  }
  return c.text("audioneko API Active", 200);
});

// Explicit notFound handler for unmatched routes
app.notFound((c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api/")) {
    return c.json({ error: "Endpoint not found", code: "NOT_FOUND", status: 404 }, 404);
  }
  return c.text("Not Found", 404);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    // Scheduled 6-hour cron (0 */6 * * *) for automatic LRU active shelf maintenance
    await evictLruBooks(0, env);
  },
  async queue(batch: MessageBatch<ShelfQueueMessage>, env: Env): Promise<void> {
    await handleQueueBatch(batch, env);
  },
};

export { SyncRoom, ListenAlongRoom, app };
export * from "./types";
export * from "./db";
export * from "./auth";
export * from "./auth/middleware";
export * from "./auth/invites";
export * from "./auth/routes";
export * from "./drive/token";
export * from "./drive/stream";
export * from "./drive/metadata";
export * from "./drive/enrich";
export * from "./sync/room";
export * from "./shelf/active-shelf";
export * from "./social/analytics";
export * from "./social/presence";
export * from "./social/listen-along";
export * from "./abs/types";
export * from "./abs/auth";
export * from "./abs/mapper";
export * from "./abs/routes";
