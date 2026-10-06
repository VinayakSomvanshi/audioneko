import { count, countDistinct, desc, eq } from "drizzle-orm";
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
