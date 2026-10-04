import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import type { AuthContextVariables } from "./middleware";
import { inviteRoutes } from "./routes";

describe("Invite HTTP API Routes", () => {
  const mockD1 = {
    prepare: vi.fn(),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;

  const mockEnv: Env = {
    DB: mockD1,
    R2: {} as R2Bucket,
    KV: {} as KVNamespace,
    SYNC_ROOM: {} as DurableObjectNamespace,
    ASSETS: {} as Fetcher,
    BETTER_AUTH_SECRET: "test_secret_for_audioneko_better_auth_tests_32chars",
    APP_URL: "https://audioneko.app",
  };

  it("GET /verify returns 400 when token query param is missing", async () => {
    const app = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();
    app.route("/api/invites", inviteRoutes);

    const res = await app.request("https://audioneko.app/api/invites/verify", {}, mockEnv);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { valid: boolean; reason: string };
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("missing_token");
  });

  it("POST /register rejects requests with missing fields with 400", async () => {
    const app = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();
    app.route("/api/invites", inviteRoutes);

    const res = await app.request(
      "https://audioneko.app/api/invites/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "some_token" }), // Missing email, password, name
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  it("POST / is blocked when unauthenticated", async () => {
    const app = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();
    app.route("/api/invites", inviteRoutes);

    const res = await app.request(
      "https://audioneko.app/api/invites",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "listener" }),
      },
      mockEnv,
    );

    expect(res.status).toBe(401);
  });
});
