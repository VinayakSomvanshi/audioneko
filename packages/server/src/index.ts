import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import { type AuthContextVariables, requireAdmin, requireAuth } from "./auth/middleware";
import { inviteRoutes } from "./auth/routes";
import { createDb } from "./db";
import { books } from "./db/schema";
import { handleAudioStreamRequest } from "./drive/stream";
import {
  ACTIVE_SHELF_PREFIX,
  dispatchShelfTask,
  evictLruBooks,
  getActiveShelfStatus,
  handleQueueBatch,
} from "./shelf/active-shelf";
import { SyncRoom } from "./sync/room";
import type { Env, ShelfQueueMessage } from "./types";

const app = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

app.use("*", cors());

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

// Audio streaming range proxy endpoint (GET and HEAD)
app.get("/api/stream/:fileId", (c) => {
  const fileId = c.req.param("fileId");
  return handleAudioStreamRequest(c.req.raw, fileId, c.env);
});

app.on("HEAD", "/api/stream/:fileId", (c) => {
  const fileId = c.req.param("fileId");
  return handleAudioStreamRequest(c.req.raw, fileId, c.env);
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
  return c.newResponse(res.body, res.status as 200, Object.fromEntries(res.headers.entries()));
});

// ==========================================
// Cloudflare R2 "Active Shelf" Cache Routes
// ==========================================

// Get current Active Shelf status, total size, and cached books
app.get("/api/shelf/status", async (c) => {
  const status = await getActiveShelfStatus(c.env);
  return c.json(status);
});

// Pre-cache an audiobook to R2 Active Shelf
app.post("/api/shelf/precache/:bookId", requireAuth, async (c) => {
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
    where: eq(books.id, bookId),
    with: { files: true },
  });

  if (!book) {
    return c.json({ error: "Book not found" }, 404);
  }

  if (c.env.R2 && book.files[0]?.driveFileId) {
    await c.env.R2.delete(`${ACTIVE_SHELF_PREFIX}${book.files[0].driveFileId}`);
  }

  await db
    .update(books)
    .set({
      isActiveShelf: false,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(books.id, bookId));

  return c.json({ success: true, bookId });
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

export { SyncRoom, app };
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
