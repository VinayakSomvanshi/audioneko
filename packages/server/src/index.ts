import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import { inviteRoutes } from "./auth/routes";
import { handleAudioStreamRequest } from "./drive/stream";
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

export default app;
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
