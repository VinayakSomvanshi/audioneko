/**
 * audioneko: Audiobookshelf API Compatibility Routes
 * Provides drop-in endpoint emulation for Audiobookshelf clients (Plappa, ShelfPlayer, ABS Mobile).
 */

import { and, desc, eq, like, or } from "drizzle-orm";
import { Hono } from "hono";
import { createAuth } from "../auth";
import type { AuthContextVariables } from "../auth/middleware";
import { createDb } from "../db";
import { books, progress, series, session, user } from "../db/schema";
import { handleAudioStreamRequest } from "../drive/stream";
import type { Env } from "../types";
import { optionalAbsAuth, requireAbsAuth } from "./auth";
import { mapBookToAbsItem, mapProgressToAbs } from "./mapper";
import type {
  AbsItemsResponse,
  AbsLibrary,
  AbsLoginResponse,
  AbsPersonalizedShelf,
  AbsUser,
} from "./types";

export const absRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthContextVariables;
}>();

// ==========================================
// 1. Health, Status & Ping Endpoints
// ==========================================

absRoutes.get("/ping", (c) => c.json({ success: true }));

absRoutes.get("/status", (c) =>
  c.json({
    isInit: true,
    language: "en",
    serverVersion: "2.17.0-audioneko",
    source: "audioneko",
  }),
);

// ==========================================
// 2. Authentication & User Profile
// ==========================================

export interface AbsLoginBody {
  username?: string;
  password?: string;
}

absRoutes.post("/login", async (c) => {
  let body: AbsLoginBody = {};
  try {
    body = await c.req.json<AbsLoginBody>();
  } catch {
    body = {};
  }

  const username = body.username?.trim();
  const password = body.password;

  if (!username || !password) {
    return c.json({ error: "Validation failed", message: "Username and password required" }, 400);
  }

  const db = createDb(c.env.DB);

  // Look up user by email or name
  const foundUser = await db.query.user.findFirst({
    where: or(eq(user.email, username.toLowerCase()), eq(user.name, username)),
  });

  if (!foundUser) {
    return c.json({ error: "Invalid credentials", message: "User not found" }, 401);
  }

  const auth = createAuth(c.env);
  const authRes = await auth.api.signInEmail({
    body: {
      email: foundUser.email,
      password,
    },
    asResponse: true,
  });

  if (!authRes.ok) {
    return c.json({ error: "Invalid credentials", message: "Incorrect password" }, 401);
  }

  // Retrieve active session token
  const activeSession = await db.query.session.findFirst({
    where: eq(session.userId, foundUser.id),
    orderBy: [desc(session.createdAt)],
  });

  const sessionToken = activeSession?.token || crypto.randomUUID();

  const absUser: AbsUser = {
    id: foundUser.id,
    username: foundUser.name || foundUser.email,
    email: foundUser.email,
    type: foundUser.role === "admin" ? "root" : "user",
    token: sessionToken,
    isActive: true,
    isLocked: false,
    lastSeen: Date.now(),
    createdAt: foundUser.createdAt.getTime(),
    permissions: {
      download: true,
      update: true,
      delete: false,
      upload: false,
      accessAllLibraries: true,
      accessAllTags: true,
    },
    librariesAccessible: ["default-audiobooks"],
  };

  const response: AbsLoginResponse = {
    user: absUser,
    userDefaultLibraryId: "default-audiobooks",
    serverSettings: {
      id: "audioneko-edge",
      scannerFindCovers: true,
      rateLimitRequests: 0,
    },
    Source: "audioneko",
  };

  return c.json(response);
});

// Authorize check endpoint used by ABS clients on app start
absRoutes.get("/authorize", requireAbsAuth, (c) => {
  const currentUser = c.get("user");
  const currentSession = c.get("session");

  const absUser: AbsUser = {
    id: currentUser.id,
    username: currentUser.name || currentUser.email,
    email: currentUser.email,
    type: currentUser.role === "admin" ? "root" : "user",
    token: currentSession.token,
    isActive: true,
    isLocked: false,
    lastSeen: Date.now(),
    createdAt: currentUser.createdAt.getTime(),
    permissions: {
      download: true,
      update: true,
      delete: false,
      upload: false,
      accessAllLibraries: true,
      accessAllTags: true,
    },
    librariesAccessible: ["default-audiobooks"],
  };

  return c.json({
    user: absUser,
    userDefaultLibraryId: "default-audiobooks",
    serverSettings: {
      id: "audioneko-edge",
      scannerFindCovers: true,
      rateLimitRequests: 0,
    },
    Source: "audioneko",
  });
});

// Current user profile
absRoutes.get("/me", requireAbsAuth, (c) => {
  const currentUser = c.get("user");
  const currentSession = c.get("session");

  const absUser: AbsUser = {
    id: currentUser.id,
    username: currentUser.name || currentUser.email,
    email: currentUser.email,
    type: currentUser.role === "admin" ? "root" : "user",
    token: currentSession.token,
    isActive: true,
    isLocked: false,
    lastSeen: Date.now(),
    createdAt: currentUser.createdAt.getTime(),
    permissions: {
      download: true,
      update: true,
      delete: false,
      upload: false,
      accessAllLibraries: true,
      accessAllTags: true,
    },
    librariesAccessible: ["default-audiobooks"],
  };

  return c.json(absUser);
});

// ==========================================
// 3. Libraries Endpoints
// ==========================================

const DEFAULT_LIBRARY: AbsLibrary = {
  id: "default-audiobooks",
  name: "Audiobooks",
  mediaType: "book",
  folders: [
    {
      id: "drive-vault",
      fullPath: "/vault",
      libraryId: "default-audiobooks",
    },
  ],
  displayOrder: 1,
  icon: "books",
};

absRoutes.get("/libraries", optionalAbsAuth, async (c) => {
  const db = createDb(c.env.DB);
  const allBooks = await db.query.books.findMany({ columns: { id: true } });

  const libraryWithCount: AbsLibrary = {
    ...DEFAULT_LIBRARY,
    mediaCount: allBooks.length,
  };

  return c.json({ libraries: [libraryWithCount] });
});

absRoutes.get("/libraries/:libraryId", optionalAbsAuth, async (c) => {
  const db = createDb(c.env.DB);
  const allBooks = await db.query.books.findMany({ columns: { id: true } });

  return c.json({
    ...DEFAULT_LIBRARY,
    mediaCount: allBooks.length,
  });
});

// Personalized home feed (Continue Listening & Recently Added)
absRoutes.get("/libraries/:libraryId/personalized", optionalAbsAuth, async (c) => {
  const db = createDb(c.env.DB);
  const currentUser = c.get("user");

  const shelves: AbsPersonalizedShelf[] = [];

  // Continue listening shelf
  if (currentUser?.id) {
    const userProgressList = await db.query.progress.findMany({
      where: and(eq(progress.userId, currentUser.id), eq(progress.isFinished, false)),
      orderBy: [desc(progress.updatedAt)],
      limit: 10,
      with: {
        book: {
          with: {
            chapters: true,
            files: true,
            series: true,
          },
        },
      },
    });

    const continueEntities = userProgressList
      .filter((p) => p.book && p.currentTimeSeconds > 0)
      .map((p) => mapBookToAbsItem(p.book, p));

    if (continueEntities.length > 0) {
      shelves.push({
        id: "continue-listening",
        label: "Continue Listening",
        type: "continue-listening",
        entities: continueEntities,
      });
    }
  }

  // Recently added books shelf
  const recentBooks = await db.query.books.findMany({
    orderBy: [desc(books.createdAt)],
    limit: 12,
    with: {
      chapters: true,
      files: true,
      series: true,
    },
  });

  let progressMap = new Map<string, typeof progress.$inferSelect>();
  if (currentUser?.id && recentBooks.length > 0) {
    const pList = await db.query.progress.findMany({
      where: eq(progress.userId, currentUser.id),
    });
    progressMap = new Map(pList.map((p) => [p.bookId, p]));
  }

  const recentEntities = recentBooks.map((b) => mapBookToAbsItem(b, progressMap.get(b.id)));

  shelves.push({
    id: "recently-added",
    label: "Recently Added",
    type: "books",
    entities: recentEntities,
  });

  return c.json(shelves);
});

// Library items with pagination and search filter
absRoutes.get("/libraries/:libraryId/items", optionalAbsAuth, async (c) => {
  const db = createDb(c.env.DB);
  const currentUser = c.get("user");

  const page = Math.max(0, Number.parseInt(c.req.query("page") || "0", 10) || 0);
  const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") || "50", 10) || 50));
  const sort = c.req.query("sort") || "addedAt";
  const descSort = c.req.query("desc") !== "0";
  const filter = c.req.query("filter")?.trim();

  const whereClause = filter
    ? or(like(books.title, `%${filter}%`), like(books.author, `%${filter}%`))
    : undefined;

  const totalCountResult = await db.query.books.findMany({
    where: whereClause,
    columns: { id: true },
  });
  const total = totalCountResult.length;

  const bookRows = await db.query.books.findMany({
    where: whereClause,
    limit,
    offset: page * limit,
    orderBy: [descSort ? desc(books.createdAt) : books.createdAt],
    with: {
      chapters: true,
      files: true,
      series: true,
    },
  });

  let progressMap = new Map<string, typeof progress.$inferSelect>();
  if (currentUser?.id && bookRows.length > 0) {
    const pList = await db.query.progress.findMany({
      where: eq(progress.userId, currentUser.id),
    });
    progressMap = new Map(pList.map((p) => [p.bookId, p]));
  }

  const results = bookRows.map((b) => mapBookToAbsItem(b, progressMap.get(b.id)));

  const response: AbsItemsResponse = {
    results,
    total,
    limit,
    page,
    sortBy: sort,
    sortDesc: descSort,
    filterBy: filter || "",
  };

  return c.json(response);
});

// Library series list
absRoutes.get("/libraries/:libraryId/series", optionalAbsAuth, async (c) => {
  const db = createDb(c.env.DB);
  const allSeries = await db.query.series.findMany({
    with: {
      books: {
        with: {
          files: true,
        },
      },
    },
  });

  const results = allSeries.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    numBooks: s.books.length,
    addedAt: (s.createdAt || 0) * 1000,
    updatedAt: (s.createdAt || 0) * 1000,
  }));

  return c.json({ results });
});

// ==========================================
// 4. Single Item & Media Player Endpoints
// ==========================================

absRoutes.get("/items/:id", optionalAbsAuth, async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env.DB);
  const currentUser = c.get("user");

  const book = await db.query.books.findFirst({
    where: eq(books.id, id),
    with: {
      chapters: true,
      files: true,
      series: true,
    },
  });

  if (!book) {
    return c.json({ error: "Item not found" }, 404);
  }

  let userProgress: typeof progress.$inferSelect | undefined;
  if (currentUser?.id) {
    userProgress = await db.query.progress.findFirst({
      where: and(eq(progress.userId, currentUser.id), eq(progress.bookId, id)),
    });
  }

  const item = mapBookToAbsItem(book, userProgress);
  return c.json(item);
});

// Cover artwork streaming or SVG placeholder
absRoutes.on(["GET", "HEAD"], "/items/:id/cover", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const book = await db.query.books.findFirst({
    where: eq(books.id, id),
    columns: { id: true, title: true, author: true, coverR2Key: true },
  });

  if (!book) {
    return c.text("Not found", 404);
  }

  // If stored in R2, stream image directly
  if (c.env.R2 && book.coverR2Key) {
    try {
      const obj = await c.env.R2.get(book.coverR2Key);
      if (obj) {
        return new Response(c.req.method === "HEAD" ? null : obj.body, {
          headers: {
            "Content-Type": obj.httpMetadata?.contentType || "image/jpeg",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    } catch {
      // Fallback to SVG placeholder
    }
  }

  // Crisp obsidian sober-thoughts fallback SVG
  const safeTitle = (book.title || "Audiobook").replace(/[<>&"]/g, "");
  const safeAuthor = (book.author || "Unknown").replace(/[<>&"]/g, "");
  const initial = safeTitle.charAt(0).toUpperCase() || "A";
  const displayTitle = safeTitle.length > 25 ? `${safeTitle.slice(0, 24)}…` : safeTitle;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
    <rect width="600" height="600" fill="#101012"/>
    <rect x="24" y="24" width="552" height="552" rx="16" fill="#18181b" stroke="#27272a" stroke-width="2"/>
    <circle cx="300" cy="220" r="70" fill="#e04838" fill-opacity="0.15" stroke="#e04838" stroke-width="2"/>
    <text x="300" y="235" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="700" fill="#e04838" text-anchor="middle">${initial}</text>
    <text x="300" y="360" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="#f4f4f5" text-anchor="middle">${displayTitle}</text>
    <text x="300" y="405" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="400" fill="#a1a1aa" text-anchor="middle">${safeAuthor}</text>
    <text x="300" y="520" font-family="monospace" font-size="13" fill="#71717a" text-anchor="middle">audioneko</text>
  </svg>`;

  return new Response(c.req.method === "HEAD" ? null : svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

// Stream audio file (supports both GET audio chunks and HEAD range probes)
absRoutes.on(["GET", "HEAD"], "/items/:id/file/:fileId", (c) => {
  const fileId = c.req.param("fileId");
  return handleAudioStreamRequest(c.req.raw, fileId, c.env);
});

// ABS Play session start endpoint
absRoutes.get("/items/:id/play", optionalAbsAuth, async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env.DB);
  const currentUser = c.get("user");

  const book = await db.query.books.findFirst({
    where: eq(books.id, id),
    with: {
      chapters: true,
      files: true,
      series: true,
    },
  });

  if (!book) {
    return c.json({ error: "Item not found" }, 404);
  }

  let userProgress: typeof progress.$inferSelect | undefined;
  if (currentUser?.id) {
    userProgress = await db.query.progress.findFirst({
      where: and(eq(progress.userId, currentUser.id), eq(progress.bookId, id)),
    });
  }

  const absItem = mapBookToAbsItem(book, userProgress);

  return c.json({
    currentTime: userProgress?.currentTimeSeconds || 0,
    playbackSession: {
      id: `session_${book.id}`,
      userId: currentUser?.id || "guest",
      libraryItemId: book.id,
      mediaMetadata: absItem.media.metadata,
      audioTracks: absItem.media.tracks,
      chapters: absItem.media.chapters,
      duration: book.durationSeconds,
      playMethod: "directStream",
    },
  });
});

// ==========================================
// 5. Listening Progress Endpoints
// ==========================================

// Get all progress records for authenticated user
absRoutes.get("/me/progress", requireAbsAuth, async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);

  const pList = await db.query.progress.findMany({
    where: eq(progress.userId, user.id),
  });

  const results = pList.map((p) => mapProgressToAbs(p));
  return c.json(results);
});

// Get progress for a specific book
absRoutes.get("/me/progress/:id", requireAbsAuth, async (c) => {
  const user = c.get("user");
  const bookId = c.req.param("id");
  const db = createDb(c.env.DB);

  const p = await db.query.progress.findFirst({
    where: and(eq(progress.userId, user.id), eq(progress.bookId, bookId)),
  });

  if (!p) {
    return c.json(null);
  }

  return c.json(mapProgressToAbs(p));
});

export interface UpdateProgressBody {
  currentTime?: number;
  duration?: number;
  progress?: number;
  isFinished?: boolean;
}

// Update progress for a book
async function handleUpdateProgress(
  userId: string,
  bookId: string,
  body: UpdateProgressBody,
  env: Env,
) {
  const db = createDb(env.DB);
  const now = Math.floor(Date.now() / 1000);

  const existing = await db.query.progress.findFirst({
    where: and(eq(progress.userId, userId), eq(progress.bookId, bookId)),
  });

  const duration = body.duration ?? existing?.durationSeconds ?? 0;
  const currentTime = body.currentTime ?? existing?.currentTimeSeconds ?? 0;
  const progressFraction =
    typeof body.progress === "number" ? body.progress : duration > 0 ? currentTime / duration : 0;

  const isFinished = body.isFinished ?? existing?.isFinished ?? false;

  if (existing) {
    await db
      .update(progress)
      .set({
        currentTimeSeconds: currentTime,
        durationSeconds: duration,
        progressFraction,
        isFinished,
        updatedAt: now,
      })
      .where(eq(progress.id, existing.id));

    return mapProgressToAbs({
      id: existing.id,
      bookId,
      currentTimeSeconds: currentTime,
      durationSeconds: duration,
      progressFraction,
      isFinished,
      updatedAt: now,
    });
  }

  const newId = `prog_${crypto.randomUUID()}`;
  await db.insert(progress).values({
    id: newId,
    userId,
    bookId,
    currentTimeSeconds: currentTime,
    durationSeconds: duration,
    progressFraction,
    isFinished,
    updatedAt: now,
  });

  return mapProgressToAbs({
    id: newId,
    bookId,
    currentTimeSeconds: currentTime,
    durationSeconds: duration,
    progressFraction,
    isFinished,
    updatedAt: now,
  });
}

absRoutes.patch("/me/progress/:id", requireAbsAuth, async (c) => {
  const user = c.get("user");
  const bookId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as UpdateProgressBody;

  const updated = await handleUpdateProgress(user.id, bookId, body, c.env);
  return c.json(updated);
});

// Alias: /items/:id/progress (used by some ABS players)
absRoutes.post("/items/:id/progress", requireAbsAuth, async (c) => {
  const user = c.get("user");
  const bookId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as UpdateProgressBody;

  const updated = await handleUpdateProgress(user.id, bookId, body, c.env);
  return c.json(updated);
});

// Periodic session sync
absRoutes.post("/session/:sessionId/sync", requireAbsAuth, async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as {
    currentTime?: number;
    duration?: number;
    progress?: number;
    libraryItemId?: string;
  };

  if (body.libraryItemId && typeof body.currentTime === "number") {
    await handleUpdateProgress(
      user.id,
      body.libraryItemId,
      {
        currentTime: body.currentTime,
        duration: body.duration,
        progress: body.progress,
      },
      c.env,
    );
  }

  return c.json({ success: true });
});

// Close playback session
absRoutes.post("/session/:sessionId/close", (c) => c.json({ success: true }));
