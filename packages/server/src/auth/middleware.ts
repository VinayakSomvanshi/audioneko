import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { createDb } from "../db";
import * as schema from "../db/schema";
import type { Env } from "../types";
import { createAuth } from "./index";

export interface AuthContextVariables {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    role: "admin" | "listener";
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
}

/**
 * Extracts authentication token from request:
 * 1. Authorization: Bearer <token>
 * 2. x-token: <token>
 * 3. URL query parameter ?token=<token>
 */
export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const xToken = req.headers.get("x-token");
  if (xToken?.trim()) {
    return xToken.trim();
  }

  try {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get("token");
    if (queryToken?.trim()) {
      return queryToken.trim();
    }
  } catch {
    // Ignore URL parse failure
  }

  return null;
}

/**
 * Helper to ensure user role is strictly resolved from D1
 */
async function resolveUserWithRole(
  env: Env,
  rawUser: Record<string, unknown>,
): Promise<AuthContextVariables["user"]> {
  const userObj = { ...rawUser } as unknown as AuthContextVariables["user"];
  try {
    const db = createDb(env.DB);
    const row = await db
      .select({ role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.id, userObj.id))
      .limit(1);
    if (row[0]?.role) {
      userObj.role = row[0].role as "admin" | "listener";
    } else {
      userObj.role = (userObj.role as "admin" | "listener") || "listener";
    }
  } catch {
    userObj.role = (userObj.role as "admin" | "listener") || "listener";
  }
  return userObj;
}

/**
 * Resolves authenticated user and session using Better Auth or token from D1
 */
export async function authenticateRequest(
  env: Env,
  req: Request,
): Promise<{
  user: AuthContextVariables["user"];
  session: AuthContextVariables["session"];
} | null> {
  // 1. Check Better Auth session via cookies or Authorization header
  try {
    const auth = createAuth(env);
    const sessionData = await auth.api.getSession({
      headers: req.headers,
    });

    if (sessionData?.user && sessionData?.session) {
      const userWithRole = await resolveUserWithRole(
        env,
        sessionData.user as Record<string, unknown>,
      );
      return {
        user: userWithRole,
        session: sessionData.session as AuthContextVariables["session"],
      };
    }
  } catch {
    // Fall back to token verification
  }

  // 2. Direct session token verification from Authorization: Bearer, x-token, or ?token=
  const token = extractTokenFromRequest(req);
  if (token) {
    try {
      const db = createDb(env.DB);
      const sessionRow = await db.query.session.findFirst({
        where: eq(schema.session.token, token),
        with: {
          user: true,
        },
      });

      if (sessionRow && sessionRow.expiresAt.getTime() > Date.now()) {
        const u = sessionRow.user;
        const userObj: AuthContextVariables["user"] = {
          id: u.id,
          email: u.email,
          name: u.name,
          emailVerified: u.emailVerified,
          image: u.image,
          role: (u.role as "admin" | "listener") || "listener",
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        };
        const sessionObj: AuthContextVariables["session"] = {
          id: sessionRow.id,
          userId: sessionRow.userId,
          expiresAt: sessionRow.expiresAt,
          token: sessionRow.token,
          ipAddress: sessionRow.ipAddress,
          userAgent: sessionRow.userAgent,
        };
        return { user: userObj, session: sessionObj };
      }
    } catch {
      // Ignore database lookup error
    }
  }

  return null;
}

/**
 * Enforces a valid Better Auth session or token on protected routes.
 * Returns 401 Unauthorized if the session cookie or token is missing or invalid.
 */
export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthContextVariables;
}> = async (c, next) => {
  const result = await authenticateRequest(c.env, c.req.raw);

  if (!result) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Valid authentication session or token required",
      },
      401,
    );
  }

  c.set("user", result.user);
  c.set("session", result.session);

  await next();
};

/**
 * Populates session/user on context if present, but does not block unauthenticated requests.
 */
export const optionalAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: Partial<AuthContextVariables>;
}> = async (c, next) => {
  try {
    const result = await authenticateRequest(c.env, c.req.raw);
    if (result) {
      c.set("user", result.user);
      c.set("session", result.session);
    }
  } catch {
    // Gracefully ignore session lookup errors for optional auth
  }

  await next();
};

/**
 * Enforces admin role on protected routes. Must be chained after requireAuth.
 */
export const requireAdmin: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthContextVariables;
}> = async (c, next) => {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return c.json(
      {
        error: "Forbidden",
        message: "Admin privileges required for this action",
      },
      403,
    );
  }

  await next();
};
