import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db";
import { user } from "../db/schema";
import type { Env } from "../types";
import { dispatchWelcomeEmail } from "./email";
import { createAuth } from "./index";
import { createInvite, listInvites, redeemInviteToken, verifyInviteToken } from "./invites";
import { type AuthContextVariables, requireAdmin, requireAuth } from "./middleware";

export const inviteRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthContextVariables;
}>();

/**
 * Public: Validate an invite token before rendering sign-up page
 */
inviteRoutes.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.json({ valid: false, reason: "missing_token" }, 400);
  }

  const db = createDb(c.env.DB);
  const result = await verifyInviteToken(db, token);

  if (!result.valid) {
    return c.json({ valid: false, reason: result.reason }, 200);
  }

  return c.json(
    {
      valid: true,
      role: result.invite?.role,
      expiresAt: result.invite?.expiresAt,
    },
    200,
  );
});

export interface CreateInviteBody {
  role?: "admin" | "listener";
  maxUses?: number;
  expiresInDays?: number;
}

export interface RegisterBody {
  token?: string;
  email?: string;
  password?: string;
  name?: string;
}

/**
 * Admin: Generate a new single-use or multi-use invite link
 */
inviteRoutes.post("/", requireAuth, requireAdmin, async (c) => {
  const currentUser = c.get("user");
  let body: CreateInviteBody = {};
  try {
    body = await c.req.json<CreateInviteBody>();
  } catch {
    body = {};
  }

  const db = createDb(c.env.DB);
  const invite = await createInvite(db, {
    createdByUserId: currentUser.id,
    role: body.role,
    maxUses: body.maxUses,
    expiresInDays: body.expiresInDays,
  });

  const baseUrl = c.env.APP_URL || new URL(c.req.url).origin;
  const inviteUrl = `${baseUrl}/join?token=${invite.token}`;

  return c.json(
    {
      success: true,
      invite: {
        id: invite.id,
        token: invite.token,
        inviteUrl,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
    },
    201,
  );
});

/**
 * Admin: List all created invites
 */
inviteRoutes.get("/", requireAuth, requireAdmin, async (c) => {
  const db = createDb(c.env.DB);
  const invitesList = await listInvites(db);
  return c.json({ invites: invitesList });
});

/**
 * Public: Redeem invite token and register with email/password
 */
inviteRoutes.post("/register", async (c) => {
  let body: RegisterBody = {};
  try {
    body = await c.req.json<RegisterBody>();
  } catch {
    body = {};
  }

  if (!body.token || !body.email || !body.password || !body.name) {
    return c.json(
      {
        error: "Validation failed",
        message: "Invite token, email, password, and name are all required",
      },
      400,
    );
  }

  const db = createDb(c.env.DB);
  const verification = await verifyInviteToken(db, body.token);

  if (!verification.valid || !verification.invite) {
    return c.json(
      {
        error: "Invalid invite",
        message: `Invite token is ${verification.reason || "invalid"}`,
      },
      400,
    );
  }

  const auth = createAuth(c.env);

  try {
    // Register the user with Better Auth
    const authResponse = await auth.api.signUpEmail({
      body: {
        email: body.email.toLowerCase().trim(),
        password: body.password,
        name: body.name.trim(),
      },
      asResponse: true,
    });

    if (!authResponse.ok) {
      const err = await authResponse.json().catch(() => ({ message: "Sign up failed" }));
      return c.json(err, authResponse.status as 400 | 500);
    }

    // Atomically increment invite usage
    await redeemInviteToken(db, body.token);

    // Dispatch welcome email to new listener
    try {
      await dispatchWelcomeEmail(c.env, {
        to: body.email.toLowerCase().trim(),
        name: body.name.trim(),
        role: verification.invite.role,
      });
    } catch (err) {
      console.error("[email] Error sending welcome email:", err);
    }

    // If invite assigned a specific role (e.g. admin), ensure it is persisted in the database
    if (verification.invite.role && verification.invite.role !== "listener") {
      await db
        .update(user)
        .set({ role: verification.invite.role })
        .where(eq(user.email, body.email.toLowerCase().trim()));
    }

    // Forward the session cookie and response headers to the client
    const responseHeaders = new Headers(authResponse.headers);
    const authData = await authResponse.json();

    return new Response(JSON.stringify(authData), {
      status: 201,
      headers: responseHeaders,
    });
  } catch (error) {
    return c.json(
      {
        error: "Registration failed",
        message: error instanceof Error ? error.message : "Internal error during registration",
      },
      500,
    );
  }
});
