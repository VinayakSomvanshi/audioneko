/**
 * audioneko: Authentication Engine
 * Powered by Better Auth with Drizzle ORM and Cloudflare D1
 * Supports Email/Username & Password with secure Web Crypto password hashing
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "../db";
import * as schema from "../db/schema";
import type { Env } from "../types";

export function createAuth(env: Env) {
  const db = createDb(env.DB);

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET || "audioneko_dev_fallback_secret_must_change_in_prod",
    baseURL: env.APP_URL || "http://localhost:5173",
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "listener",
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      sendResetPassword: async ({
        user,
        url,
        token,
      }: {
        user: { email: string; name?: string };
        url: string;
        token: string;
      }) => {
        console.log(`[auth] Password reset requested for ${user.email} (token: ${token})`);
        const resendApiKey = (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY;
        if (resendApiKey) {
          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from:
                  (env as unknown as { EMAIL_FROM?: string }).EMAIL_FROM ||
                  "audioneko <auth@audioneko.app>",
                to: user.email,
                subject: "Reset your audioneko password",
                html: `<p>A password reset was requested for your audioneko account (${user.name}).</p><p><a href="${url}">Click here to reset your password</a></p><p>Or enter this reset token: <code>${token}</code></p>`,
              }),
            });
          } catch (err) {
            console.error("[auth] Failed to send password reset email:", err);
          }
        }
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30-day persistent session
      updateAge: 60 * 60 * 24, // Refresh cookie expiration once per day
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // Cache cookie validation in memory for 5 minutes
      },
    },
    advanced: {
      useSecureCookies: env.APP_URL?.startsWith("https://") ?? false,
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
