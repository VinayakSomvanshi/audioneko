import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import { requireAuth } from "./auth/middleware";
import { inviteRoutes } from "./auth/routes";
import { handleAudioStreamRequest } from "./drive/stream";
import { SyncRoom } from "./sync/room";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

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

export default app;
export { SyncRoom };
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
