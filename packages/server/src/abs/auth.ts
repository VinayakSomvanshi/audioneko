/**
 * audioneko: Audiobookshelf Authentication Resolver & Middleware
 * Supports standard Bearer token header, x-token header, ?token query param,
 * and session cookie fallback.
 */

import type { MiddlewareHandler } from "hono";
import {
  type AuthContextVariables,
  authenticateRequest,
  extractTokenFromRequest,
} from "../auth/middleware";
import type { Env } from "../types";

/**
 * Extracts authentication token from various Audiobookshelf client locations:
 * 1. Authorization: Bearer <token>
 * 2. x-token: <token>
 * 3. URL query parameter ?token=<token>
 */
export function extractAbsToken(req: Request): string | null {
  return extractTokenFromRequest(req);
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
  const auth = await authenticateRequest(env, req);
  if (!auth) return null;
  return {
    user: auth.user,
    session: auth.session,
    token: auth.session.token,
  };
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
