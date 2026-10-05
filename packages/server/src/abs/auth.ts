/**
 * audioneko: Audiobookshelf Authentication Resolver & Middleware
 * Supports standard Bearer token header, x-token header, ?token query param,
 * and session cookie fallback.
 */

import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { createAuth } from "../auth";
import type { AuthContextVariables } from "../auth/middleware";
import { createDb } from "../db";
import { session, user } from "../db/schema";
import type { Env } from "../types";

/**
 * Extracts authentication token from various Audiobookshelf client locations:
 * 1. Authorization: Bearer <token>
 * 2. x-token: <token>
 * 3. URL query parameter ?token=<token>
 */
export function extractAbsToken(req: Request): string | null {
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

export interface ResolvedAbsAuth {
  user: AuthContextVariables["user"];
  session: AuthContextVariables["session"];
  token: string;
}

/**
 * Resolves authenticated user and session using the token or Better Auth session adapter.
 */
export async function resolveAbsUser(env: Env, req: Request): Promise<ResolvedAbsAuth | null> {
  const token = extractAbsToken(req);
  const db = createDb(env.DB);

  // 1. Direct D1 session lookup by token
  if (token) {
    const sessionRow = await db.query.session.findFirst({
      where: eq(session.token, token),
      with: {
        user: true,
      },
    });

    if (sessionRow && sessionRow.expiresAt.getTime() > Date.now()) {
      const u = sessionRow.user;
      return {
        user: {
          id: u.id,
          email: u.email,
          name: u.name,
          emailVerified: u.emailVerified,
          image: u.image,
          role: u.role,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        },
        session: {
          id: sessionRow.id,
          userId: sessionRow.userId,
          expiresAt: sessionRow.expiresAt,
          token: sessionRow.token,
          ipAddress: sessionRow.ipAddress,
          userAgent: sessionRow.userAgent,
        },
        token: sessionRow.token,
      };
    }
  }

  // 2. Fall back to Better Auth getSession
  try {
    const auth = createAuth(env);
    const headers = new Headers(req.headers);
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const sessionData = await auth.api.getSession({ headers });
    if (sessionData?.user && sessionData?.session) {
      return {
        user: sessionData.user as AuthContextVariables["user"],
        session: sessionData.session as AuthContextVariables["session"],
        token: sessionData.session.token,
      };
    }
  } catch {
    // Ignore fallback error
  }

  return null;
}

/**
 * Audiobookshelf require authentication middleware
 */
export const requireAbsAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthContextVariables;
}> = async (c, next) => {
  const resolved = await resolveAbsUser(c.env, c.req.raw);
  if (!resolved) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Valid Audiobookshelf token or session required",
      },
      401,
    );
  }

  c.set("user", resolved.user);
  c.set("session", resolved.session);
  await next();
};

/**
 * Audiobookshelf optional authentication middleware
 */
export const optionalAbsAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: Partial<AuthContextVariables>;
}> = async (c, next) => {
  const resolved = await resolveAbsUser(c.env, c.req.raw);
  if (resolved) {
    c.set("user", resolved.user);
    c.set("session", resolved.session);
  }
  await next();
};
