import { asc, count, countDistinct, desc, eq, like, or, sum } from "drizzle-orm";
import { Hono } from "hono";
import { deleteInvite } from "../auth/invites";
import {
  type AuthContextVariables,
  optionalAuth,
  requireAdmin,
  requireAuth,
} from "../auth/middleware";
import { createDb } from "../db";
import * as schema from "../db/schema";
import { scanDriveLibrary } from "../drive/scanner";
import { evictLruBooks, getActiveShelfStatus } from "../shelf/active-shelf";
import type { Env } from "../types";
import {
  getBookHiddenStatus,
  getVisibility,
  isAuthorHidden,
  isSeriesHidden,
  setVisibilityRule,
} from "./visibility";
import type { AdminVisibilityResponse } from "@audioneko/shared";

export const adminRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthContextVariables;
}>();

/**
 * Public/Self: Current user details and admin role status
 */
adminRoutes.get("/me", optionalAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ user: null, isAdmin: false });
  }

  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    isAdmin: user.role === "admin",
  });
});

/**
 * Admin: Comprehensive library & system statistics
 */
adminRoutes.get("/stats", requireAuth, requireAdmin, async (c) => {
  const db = createDb(c.env.DB);

  const [booksCountRes, authorsCountRes, seriesCountRes, usersCountRes, invitesCountRes] =
    await Promise.all([
      db.select({ count: count() }).from(schema.books),
      db.select({ count: countDistinct(schema.books.author) }).from(schema.books),
      db.select({ count: count() }).from(schema.series),
      db.select({ count: count() }).from(schema.user),
      db.select({ count: count() }).from(schema.invites),
    ]);

  let activeShelf = null;
  try {
    activeShelf = await getActiveShelfStatus(c.env);
  } catch {
    // Non-critical if KV is not populated yet
  }

  return c.json({
    booksCount: booksCountRes[0]?.count ?? 0,
    authorsCount: authorsCountRes[0]?.count ?? 0,
    seriesCount: seriesCountRes[0]?.count ?? 0,
    usersCount: usersCountRes[0]?.count ?? 0,
    invitesCount: invitesCountRes[0]?.count ?? 0,
    activeShelf,
  });
});

/**
 * Admin: List all registered users
 */
adminRoutes.get("/users", requireAuth, requireAdmin, async (c) => {
  const db = createDb(c.env.DB);
  const usersList = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .orderBy(desc(schema.user.createdAt));

  return c.json({ users: usersList });
});

/**
 * Admin: Update user role (promote to admin or demote to listener)
 */
adminRoutes.post("/users/:id/role", requireAuth, requireAdmin, async (c) => {
  const targetUserId = c.req.param("id");
  const currentUser = c.get("user");
  const body = await c.req.json<{ role: "admin" | "listener" }>().catch(() => null);

  if (!body?.role || !["admin", "listener"].includes(body.role)) {
    return c.json({ error: "Invalid role specified" }, 400);
  }

  // Prevent admin from demoting themselves if they are the current actor
  if (targetUserId === currentUser.id && body.role !== "admin") {
    return c.json({ error: "Cannot demote your own admin account" }, 400);
  }

  const db = createDb(c.env.DB);
  await db.update(schema.user).set({ role: body.role }).where(eq(schema.user.id, targetUserId));

  return c.json({ success: true, targetUserId, newRole: body.role });
});

/**
 * Admin: Trigger Google Drive library scan
 */
adminRoutes.post("/scan", requireAuth, requireAdmin, async (c) => {
  try {
    let folderId = c.env.GOOGLE_DRIVE_FOLDER_ID || "1Eb41o9yGeJoojEYniUZvRCjaxBziLN-Z";
    const body = await c.req.json<{ folderId?: string }>().catch(() => ({}));
    if (body && typeof body === "object" && "folderId" in body && body.folderId) {
      folderId = String(body.folderId).trim();
    }

    const result = await scanDriveLibrary(c.env, folderId);
    return c.json({ success: true, result });
  } catch (err) {
    console.error("Admin scan failed:", err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * Admin: Trigger manual active shelf LRU cache eviction
 */
adminRoutes.post("/shelf/evict", requireAuth, requireAdmin, async (c) => {
  try {
    const evicted = await evictLruBooks(0, c.env);
    return c.json({ success: true, evictedCount: evicted });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * Admin: Revoke / delete an invite link
 */
adminRoutes.delete("/invites/:id", requireAuth, requireAdmin, async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env.DB);
  await deleteInvite(db, id);
  return c.json({ success: true, deletedId: id });
});

/**
 * Admin: Generate a password reset link/token for any registered user
 */
adminRoutes.post("/users/:id/reset-token", requireAuth, requireAdmin, async (c) => {
  const targetUserId = c.req.param("id");
  const db = createDb(c.env.DB);
  const targetUsers = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, targetUserId))
    .limit(1);
  const targetUser = targetUsers[0];

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const token = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24); // 24 hours

  await db.insert(schema.verification).values({
    id: `ver_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    identifier: `reset-password:${token}`,
    value: targetUser.id,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  const baseUrl = c.env.APP_URL || new URL(c.req.url).origin;
  const resetUrl = `${baseUrl}/login?resetToken=${token}&email=${encodeURIComponent(targetUser.email)}`;

  return c.json({
    success: true,
    token,
    resetUrl,
    email: targetUser.email,
    name: targetUser.name,
    expiresAt: expiresAt.toISOString(),
  });
});

/**
 * Admin: View detailed listening statistics for a user (Strictly Read-Only)
 */
adminRoutes.get("/users/:id/stats", requireAuth, requireAdmin, async (c) => {
  const targetUserId = c.req.param("id");
  const db = createDb(c.env.DB);

  const targetUsers = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
      createdAt: schema.user.createdAt,
      updatedAt: schema.user.updatedAt,
    })
    .from(schema.user)
    .where(eq(schema.user.id, targetUserId))
    .limit(1);

  const targetUser = targetUsers[0];
  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  // Fetch all book progress for user with book metadata
  const userProgress = await db
    .select({
      bookId: schema.progress.bookId,
      currentTimeSeconds: schema.progress.currentTimeSeconds,
      durationSeconds: schema.progress.durationSeconds,
      progressFraction: schema.progress.progressFraction,
      isFinished: schema.progress.isFinished,
      updatedAt: schema.progress.updatedAt,
      bookTitle: schema.books.title,
      bookAuthor: schema.books.author,
      coverR2Key: schema.books.coverR2Key,
      bookDuration: schema.books.durationSeconds,
    })
    .from(schema.progress)
    .leftJoin(schema.books, eq(schema.progress.bookId, schema.books.id))
    .where(eq(schema.progress.userId, targetUserId))
    .orderBy(desc(schema.progress.updatedAt));

  // Fetch aggregate listening events time
  const listeningRes = await db
    .select({
      totalSeconds: sum(schema.listeningEvents.durationListenedSeconds),
      sessionsCount: count(),
    })
    .from(schema.listeningEvents)
    .where(eq(schema.listeningEvents.userId, targetUserId));

  // Fetch bookmarks count
  const bookmarksRes = await db
    .select({ count: count() })
    .from(schema.bookmarks)
    .where(eq(schema.bookmarks.userId, targetUserId));

  const totalListeningSeconds = Number(listeningRes[0]?.totalSeconds ?? 0);
  const totalSessionsCount = Number(listeningRes[0]?.sessionsCount ?? 0);
  const totalBookmarksCount = Number(bookmarksRes[0]?.count ?? 0);

  let booksStartedCount = 0;
  let booksFinishedCount = 0;

  for (const p of userProgress) {
    if (p.isFinished || (p.progressFraction && p.progressFraction >= 0.99)) {
      booksFinishedCount++;
    } else if (p.currentTimeSeconds > 0) {
      booksStartedCount++;
    }
  }

  return c.json({
    user: targetUser,
    stats: {
      totalListeningSeconds,
      totalSessionsCount,
      booksStartedCount,
      booksFinishedCount,
      totalBookmarksCount,
      totalBooksWithProgress: userProgress.length,
    },
    books: userProgress,
  });
});

/**
 * Admin: Modify user account details (name, email, role)
 */
adminRoutes.patch("/users/:id", requireAuth, requireAdmin, async (c) => {
  const targetUserId = c.req.param("id");
  const currentUser = c.get("user");
  const body = await c.req
    .json<{
      name?: string;
      email?: string;
      role?: "admin" | "listener";
    }>()
    .catch(() => null);

  if (!body) {
    return c.json({ error: "Invalid request payload" }, 400);
  }

  const db = createDb(c.env.DB);
  const targetUsers = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, targetUserId))
    .limit(1);
  const targetUser = targetUsers[0];

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const updates: Partial<{
    name: string;
    email: string;
    role: "admin" | "listener";
    updatedAt: Date;
  }> = {};

  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return c.json({ error: "Name cannot be empty" }, 400);
    }
    updates.name = trimmed;
  }

  if (body.email !== undefined) {
    const trimmed = body.email.toLowerCase().trim();
    if (!trimmed || !trimmed.includes("@")) {
      return c.json({ error: "Valid email address is required" }, 400);
    }
    if (trimmed !== targetUser.email.toLowerCase()) {
      const existing = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.email, trimmed))
        .limit(1);
      if (existing.length > 0) {
        return c.json({ error: "Email already in use by another account" }, 400);
      }
      updates.email = trimmed;
    }
  }

  if (body.role !== undefined) {
    if (!["admin", "listener"].includes(body.role)) {
      return c.json({ error: "Invalid role specified" }, 400);
    }
    if (targetUserId === currentUser.id && body.role !== "admin") {
      return c.json({ error: "Cannot demote your own admin account" }, 400);
    }
    updates.role = body.role;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update provided" }, 400);
  }

  updates.updatedAt = new Date();

  await db.update(schema.user).set(updates).where(eq(schema.user.id, targetUserId));

  const updatedUserRes = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
      createdAt: schema.user.createdAt,
      updatedAt: schema.user.updatedAt,
    })
    .from(schema.user)
    .where(eq(schema.user.id, targetUserId))
    .limit(1);

  return c.json({ success: true, user: updatedUserRes[0] });
});

/**
 * Admin: Delete a user account and associated session/telemetry records
 */
adminRoutes.delete("/users/:id", requireAuth, requireAdmin, async (c) => {
  const targetUserId = c.req.param("id");
  const currentUser = c.get("user");

  if (targetUserId === currentUser.id) {
    return c.json({ error: "Cannot delete your own admin account" }, 400);
  }

  const db = createDb(c.env.DB);
  const targetUsers = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, targetUserId))
    .limit(1);
  const targetUser = targetUsers[0];

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  // Delete all related records cleanly across user data tables
  await db.delete(schema.progress).where(eq(schema.progress.userId, targetUserId));
  await db.delete(schema.listeningEvents).where(eq(schema.listeningEvents.userId, targetUserId));
  await db.delete(schema.bookmarks).where(eq(schema.bookmarks.userId, targetUserId));
  await db.delete(schema.clips).where(eq(schema.clips.userId, targetUserId));
  await db.delete(schema.session).where(eq(schema.session.userId, targetUserId));
  await db.delete(schema.account).where(eq(schema.account.userId, targetUserId));
  await db.delete(schema.passkey).where(eq(schema.passkey.userId, targetUserId));
  await db.delete(schema.invites).where(eq(schema.invites.createdBy, targetUserId));
  await db.delete(schema.user).where(eq(schema.user.id, targetUserId));

  return c.json({
    success: true,
    deletedUserId: targetUserId,
    deletedEmail: targetUser.email,
  });
});

/**
 * Admin: Get library catalog books with metadata & search filter
 */
adminRoutes.get("/books", requireAuth, requireAdmin, async (c) => {
  const db = createDb(c.env.DB);
  const q = c.req.query("q")?.trim() || "";

  const baseQuery = db
    .select({
      id: schema.books.id,
      driveFolderId: schema.books.driveFolderId,
      title: schema.books.title,
      author: schema.books.author,
      narrator: schema.books.narrator,
      seriesId: schema.books.seriesId,
      seriesName: schema.series.name,
      seriesIndex: schema.books.seriesIndex,
      description: schema.books.description,
      coverR2Key: schema.books.coverR2Key,
      durationSeconds: schema.books.durationSeconds,
      publishedYear: schema.books.publishedYear,
      format: schema.books.format,
      fileSizeBytes: schema.books.fileSizeBytes,
      isActiveShelf: schema.books.isActiveShelf,
      createdAt: schema.books.createdAt,
      updatedAt: schema.books.updatedAt,
    })
    .from(schema.books)
    .leftJoin(schema.series, eq(schema.books.seriesId, schema.series.id));

  const results = q
    ? await baseQuery
        .where(
          or(
            like(schema.books.title, `%${q}%`),
            like(schema.books.author, `%${q}%`),
            like(schema.books.narrator, `%${q}%`),
          ),
        )
        .orderBy(asc(schema.books.title))
        .limit(100)
    : await baseQuery.orderBy(asc(schema.books.title)).limit(100);

  return c.json({ books: results });
});

/**
 * Admin: Edit and fix metadata for a specific audiobook
 */
adminRoutes.patch("/books/:id", requireAuth, requireAdmin, async (c) => {
  const bookId = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    author?: string;
    narrator?: string | null;
    seriesName?: string | null;
    seriesIndex?: number | null;
    publishedYear?: number | null;
    description?: string | null;
    format?: "m4b" | "mp3" | "m4a" | "flac" | "opus";
  }>();

  const db = createDb(c.env.DB);

  // Check if target book exists
  const existingBooks = await db
    .select()
    .from(schema.books)
    .where(eq(schema.books.id, bookId))
    .limit(1);

  const existingBook = existingBooks[0];
  if (!existingBook) {
    return c.json({ error: "Audiobook not found" }, 404);
  }

  const updates: Partial<typeof schema.books.$inferInsert> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };

  if (body.title?.trim()) {
    updates.title = body.title.trim();
  }
  if (body.author?.trim()) {
    updates.author = body.author.trim();
  }
  if (body.narrator !== undefined) {
    updates.narrator = body.narrator?.trim() || null;
  }
  if (body.description !== undefined) {
    updates.description = body.description?.trim() || null;
  }
  if (body.publishedYear !== undefined) {
    updates.publishedYear =
      body.publishedYear && body.publishedYear > 0 ? Number(body.publishedYear) : null;
  }
  if (body.format && ["m4b", "mp3", "m4a", "flac", "opus"].includes(body.format)) {
    updates.format = body.format;
  }

  // Handle series association
  if (body.seriesName !== undefined) {
    const trimmedSeries = body.seriesName?.trim() || "";
    if (trimmedSeries) {
      const existingSeries = await db
        .select()
        .from(schema.series)
        .where(eq(schema.series.name, trimmedSeries))
        .limit(1);

      let targetSeriesId: string;
      if (existingSeries[0]) {
        targetSeriesId = existingSeries[0].id;
      } else {
        targetSeriesId = `series_${crypto.randomUUID()}`;
        await db.insert(schema.series).values({
          id: targetSeriesId,
          name: trimmedSeries,
          bookCount: 1,
        });
      }
      updates.seriesId = targetSeriesId;
      updates.seriesIndex =
        body.seriesIndex !== undefined && body.seriesIndex !== null
          ? Number(body.seriesIndex)
          : null;
    } else {
      updates.seriesId = null;
      updates.seriesIndex = null;
    }
  } else if (body.seriesIndex !== undefined) {
    updates.seriesIndex = body.seriesIndex !== null ? Number(body.seriesIndex) : null;
  }

  await db.update(schema.books).set(updates).where(eq(schema.books.id, bookId));

  const updatedBooks = await db
    .select({
      id: schema.books.id,
      title: schema.books.title,
      author: schema.books.author,
      narrator: schema.books.narrator,
      seriesId: schema.books.seriesId,
      seriesName: schema.series.name,
      seriesIndex: schema.books.seriesIndex,
      description: schema.books.description,
      coverR2Key: schema.books.coverR2Key,
      durationSeconds: schema.books.durationSeconds,
      publishedYear: schema.books.publishedYear,
      format: schema.books.format,
      fileSizeBytes: schema.books.fileSizeBytes,
      updatedAt: schema.books.updatedAt,
    })
    .from(schema.books)
    .leftJoin(schema.series, eq(schema.books.seriesId, schema.series.id))
    .where(eq(schema.books.id, bookId))
    .limit(1);

  return c.json({ success: true, book: updatedBooks[0] });
});

/**
 * Admin: Get visibility status for all books, series, and authors
 */
adminRoutes.get("/visibility", requireAuth, requireAdmin, async (c) => {
  const db = createDb(c.env.DB);
  const visibility = await getVisibility(c.env);

  const allBooks = await db
    .select({
      id: schema.books.id,
      title: schema.books.title,
      author: schema.books.author,
      seriesId: schema.books.seriesId,
      seriesIndex: schema.books.seriesIndex,
      coverR2Key: schema.books.coverR2Key,
      seriesName: schema.series.name,
    })
    .from(schema.books)
    .leftJoin(schema.series, eq(schema.books.seriesId, schema.series.id))
    .orderBy(asc(schema.books.title));

  const allSeries = await db.select().from(schema.series).orderBy(asc(schema.series.name));

  // Compute books with visibility
  const booksWithVisibility = allBooks.map((b) => {
    const status = getBookHiddenStatus(b, visibility);
    return {
      id: b.id,
      title: b.title,
      author: b.author,
      series: b.seriesName || undefined,
      coverR2Key: b.coverR2Key,
      isHidden: status.isHidden,
      hiddenReason: status.reason,
    };
  });

  // Series map to calculate book counts and primary author
  const seriesMap = new Map<
    string,
    { id: string; name: string; bookCount: number; primaryAuthor: string }
  >();
  for (const s of allSeries) {
    seriesMap.set(s.name.toLowerCase(), {
      id: s.id,
      name: s.name,
      bookCount: 0,
      primaryAuthor: "",
    });
  }

  // Author map
  const authorMap = new Map<string, { name: string; bookCount: number; seriesSet: Set<string> }>();

  for (const b of allBooks) {
    const aName = b.author?.trim() || "Unknown Author";
    if (!authorMap.has(aName.toLowerCase())) {
      authorMap.set(aName.toLowerCase(), {
        name: aName,
        bookCount: 0,
        seriesSet: new Set(),
      });
    }
    const aEntry = authorMap.get(aName.toLowerCase())!;
    aEntry.bookCount++;
    if (b.seriesName) {
      aEntry.seriesSet.add(b.seriesName);
      const sKey = b.seriesName.toLowerCase();
      if (!seriesMap.has(sKey)) {
        seriesMap.set(sKey, {
          id: b.seriesId || sKey,
          name: b.seriesName,
          bookCount: 0,
          primaryAuthor: b.author,
        });
      }
      const sEntry = seriesMap.get(sKey)!;
      sEntry.bookCount++;
      if (!sEntry.primaryAuthor && b.author) {
        sEntry.primaryAuthor = b.author;
      }
    }
  }

  const seriesWithVisibility = Array.from(seriesMap.values())
    .map((s) => ({
      id: s.id,
      name: s.name,
      bookCount: s.bookCount,
      primaryAuthor: s.primaryAuthor || "Unknown Author",
      isHidden: isSeriesHidden(s.name, visibility) || isSeriesHidden(s.id, visibility),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const authorsWithVisibility = Array.from(authorMap.values())
    .map((a) => ({
      name: a.name,
      bookCount: a.bookCount,
      seriesCount: a.seriesSet.size,
      isHidden: isAuthorHidden(a.name, visibility),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const response: AdminVisibilityResponse = {
    visibility,
    books: booksWithVisibility,
    series: seriesWithVisibility,
    authors: authorsWithVisibility,
  };

  return c.json(response);
});

/**
 * Admin: Toggle visibility of a book, series, or author
 */
adminRoutes.post("/visibility/toggle", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json<{
    type: "book" | "series" | "author";
    target: string;
    hidden: boolean;
  }>();

  if (!body.type || !body.target || typeof body.hidden !== "boolean") {
    return c.json({ error: "Invalid payload: type, target, and hidden required" }, 400);
  }

  const updatedVisibility = await setVisibilityRule(c.env, body.type, body.target, body.hidden);
  return c.json({ success: true, visibility: updatedVisibility });
});

