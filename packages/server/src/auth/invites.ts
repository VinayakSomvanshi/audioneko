/**
 * audioneko: Cryptographic Invite Token Engine
 *
 * Provides single-use or multi-use 256-bit entropy invite links for private onboarding.
 * Tokens are securely generated with Web Crypto and stored as SHA-256 hashes in Cloudflare D1.
 * The plaintext token is only returned once upon creation and never persisted to the database.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import { invites, user } from "../db/schema";

export interface CreateInviteOptions {
  createdByUserId: string;
  role?: "admin" | "listener";
  maxUses?: number;
  expiresInDays?: number;
}

export interface InviteValidationResult {
  valid: boolean;
  reason?: "invalid" | "expired" | "exhausted";
  invite?: {
    id: string;
    role: "admin" | "listener";
    expiresAt: number;
    maxUses: number;
    usedCount: number;
  };
}

/**
 * Computes a hex-encoded SHA-256 hash of a string using Web Crypto.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates a cryptographically random, URL-safe 256-bit entropy token.
 */
export function generateSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Creates a new cryptographic invite token in Cloudflare D1.
 * Returns the plaintext token and invite record details.
 */
export async function createInvite(
  db: Database,
  options: CreateInviteOptions,
): Promise<{ token: string; id: string; expiresAt: number; role: "admin" | "listener" }> {
  const rawToken = generateSecureToken();
  const tokenHash = await hashToken(rawToken);
  const id = `inv_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const durationSeconds = (options.expiresInDays ?? 7) * 24 * 60 * 60;
  const expiresAt = nowSeconds + durationSeconds;
  const role = options.role ?? "listener";
  const maxUses = options.maxUses ?? 1;

  await db.insert(invites).values({
    id,
    tokenHash,
    createdBy: options.createdByUserId,
    role,
    expiresAt,
    maxUses,
    usedCount: 0,
  });

  return {
    token: rawToken,
    id,
    expiresAt,
    role,
  };
}

/**
 * Validates whether an invite token is legitimate, unexpired, and has remaining uses.
 */
export async function verifyInviteToken(
  db: Database,
  rawToken: string,
): Promise<InviteValidationResult> {
  if (!rawToken || typeof rawToken !== "string") {
    return { valid: false, reason: "invalid" };
  }

  const tokenHash = await hashToken(rawToken.trim());
  const results = await db.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1);

  const invite = results[0];
  if (!invite) {
    return { valid: false, reason: "invalid" };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (nowSeconds >= invite.expiresAt) {
    return { valid: false, reason: "expired" };
  }

  if (invite.usedCount >= invite.maxUses) {
    return { valid: false, reason: "exhausted" };
  }

  return {
    valid: true,
    invite: {
      id: invite.id,
      role: invite.role,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      usedCount: invite.usedCount,
    },
  };
}

/**
 * Atomically redeems an invite token, incrementing its usedCount.
 * Returns true if redeemed successfully, false if invalid or exhausted.
 */
export async function redeemInviteToken(db: Database, rawToken: string): Promise<boolean> {
  const verification = await verifyInviteToken(db, rawToken);
  if (!verification.valid || !verification.invite) {
    return false;
  }

  const tokenHash = await hashToken(rawToken.trim());

  // Atomic update: only increment if usedCount is still under maxUses
  await db
    .update(invites)
    .set({
      usedCount: sql`${invites.usedCount} + 1`,
    })
    .where(and(eq(invites.tokenHash, tokenHash), sql`${invites.usedCount} < ${invites.maxUses}`));

  return true;
}

/**
 * Lists all existing invite links (for admin management).
 */
export async function listInvites(db: Database) {
  return db
    .select({
      id: invites.id,
      createdBy: invites.createdBy,
      createdByName: user.name,
      role: invites.role,
      expiresAt: invites.expiresAt,
      maxUses: invites.maxUses,
      usedCount: invites.usedCount,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .leftJoin(user, eq(invites.createdBy, user.id))
    .orderBy(desc(invites.createdAt));
}

/**
 * Deletes / revokes an invite link by ID.
 */
export async function deleteInvite(db: Database, id: string): Promise<boolean> {
  await db.delete(invites).where(eq(invites.id, id));
  return true;
}
