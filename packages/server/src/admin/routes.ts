import { count, countDistinct, desc, eq, sum } from "drizzle-orm";
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
