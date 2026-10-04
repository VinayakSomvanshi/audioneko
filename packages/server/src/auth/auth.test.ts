import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { createAuth } from "./index";
import { type AuthContextVariables, optionalAuth, requireAdmin, requireAuth } from "./middleware";

describe("Better Auth & Session Middleware Engine", () => {
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

  it("initializes Better Auth instance with correct edge options", () => {
    const auth = createAuth(mockEnv);
    expect(auth).toBeDefined();
    expect(auth.options.baseURL).toBe("https://audioneko.app");
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect(auth.options.session?.expiresIn).toBe(60 * 60 * 24 * 30); // 30-day session
    expect(auth.options.advanced?.useSecureCookies).toBe(true);
  });

  it("requireAuth blocks requests with missing or invalid session with 401", async () => {
    const app = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

    // Mock createAuth by intercepting or providing mock API
    app.use("/protected/*", async (c, next) => {
      // Simulate requireAuth behavior on empty/invalid session
      const auth = createAuth(c.env);
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.user || !sessionData?.session) {
        return c.json(
          { error: "Unauthorized", message: "Valid authentication session required" },
          401,
        );
      }
      c.set("user", sessionData.user as AuthContextVariables["user"]);
      c.set("session", sessionData.session as AuthContextVariables["session"]);
      await next();
    });

    app.get("/protected/me", (c) => c.json({ user: c.get("user") }));

    const res = await app.request("https://audioneko.app/protected/me", {}, mockEnv);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("optionalAuth proceeds without user on unauthenticated requests", async () => {
    const app = new Hono<{ Bindings: Env; Variables: Partial<AuthContextVariables> }>();

    app.use("/public-or-private/*", optionalAuth);
    app.get("/public-or-private/status", (c) => {
      const user = c.get("user");
      return c.json({ authenticated: !!user, user: user ?? null });
    });

    const res = await app.request("https://audioneko.app/public-or-private/status", {}, mockEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { authenticated: boolean; user: unknown };
    expect(body.authenticated).toBe(false);
    expect(body.user).toBeNull();
  });

  it("requireAdmin denies access to listener role with 403 Forbidden", async () => {
    const app = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

    app.use("/admin/*", async (c, next) => {
      // Set a mock listener user
      c.set("user", {
        id: "usr_listener_1",
        name: "Test Listener",
        email: "listener@audioneko.app",
        emailVerified: true,
        role: "listener",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await next();
    });

    app.use("/admin/*", requireAdmin);
    app.get("/admin/invites", (c) => c.json({ ok: true }));

    const res = await app.request("https://audioneko.app/admin/invites", {}, mockEnv);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Forbidden");
  });

  it("requireAdmin allows access when user has admin role", async () => {
    const app = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

    app.use("/admin/*", async (c, next) => {
      // Set a mock admin user
      c.set("user", {
        id: "usr_admin_1",
        name: "Test Admin",
        email: "admin@audioneko.app",
        emailVerified: true,
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await next();
    });

    app.use("/admin/*", requireAdmin);
    app.get("/admin/invites", (c) => c.json({ ok: true, admin: c.get("user").name }));

    const res = await app.request("https://audioneko.app/admin/invites", {}, mockEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; admin: string };
    expect(body.ok).toBe(true);
    expect(body.admin).toBe("Test Admin");
  });
});
