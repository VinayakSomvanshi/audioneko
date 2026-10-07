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
import { dispatchPasswordResetEmail } from "./email";

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
        url: _url,
        token,
      }: {
        user: { email: string; name?: string };
        url: string;
        token: string;
      }) => {
        console.log(`[auth] Password reset requested for ${user.email} (token: ${token})`);
        const baseUrl = env.APP_URL || "https://audioneko.greatmidoriya.workers.dev";
        const directResetUrl = `${baseUrl.replace(/\/$/, "")}/login?token=${token}&email=${encodeURIComponent(user.email)}`;

        await dispatchPasswordResetEmail(env, {
          to: user.email,
          recipientName: user.name,
          resetUrl: directResetUrl,
          token,
        });
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
