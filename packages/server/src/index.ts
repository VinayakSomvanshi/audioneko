import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleAudioStreamRequest } from "./drive/stream";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({ status: "healthy", timestamp: Date.now() });
});

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
export * from "./drive/token";
export * from "./drive/stream";
