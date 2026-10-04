import type { Context, MiddlewareHandler } from "hono";
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
 * Enforces a valid Better Auth session on protected routes.
 * Returns 401 Unauthorized if the session cookie is missing or invalid.
 */
export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthContextVariables;
}> = async (c, next) => {
  const auth = createAuth(c.env);
  const sessionData = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!sessionData?.user || !sessionData?.session) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Valid authentication session required",
      },
      401,
    );
  }

  c.set("user", sessionData.user as AuthContextVariables["user"]);
  c.set("session", sessionData.session as AuthContextVariables["session"]);

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
    const auth = createAuth(c.env);
    const sessionData = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (sessionData?.user && sessionData?.session) {
      c.set("user", sessionData.user as AuthContextVariables["user"]);
      c.set("session", sessionData.session as AuthContextVariables["session"]);
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
