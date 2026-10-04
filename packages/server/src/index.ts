import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/api/health", (c) => {
  return c.json({ status: "healthy", timestamp: Date.now() });
});

export default app;
export * from "./types";
export * from "./db";
