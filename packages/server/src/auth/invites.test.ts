import { describe, expect, it, vi } from "vitest";
import type { Database } from "../db";
import {
  createInvite,
  generateSecureToken,
  hashToken,
  redeemInviteToken,
  verifyInviteToken,
} from "./invites";

describe("Cryptographic Invite Token Engine", () => {
  it("generates 256-bit entropy URL-safe hexadecimal tokens", () => {
    const token1 = generateSecureToken();
    const token2 = generateSecureToken();

    expect(token1).toHaveLength(64); // 32 bytes * 2 hex chars
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
    expect(/^[0-9a-f]{64}$/.test(token1)).toBe(true);
  });

  it("hashes token deterministically using Web Crypto SHA-256", async () => {
    const rawToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const hash1 = await hashToken(rawToken);
    const hash2 = await hashToken(rawToken);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).not.toBe(rawToken);
  });

  it("creates an invite with correct expiration and hashed token in D1", async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    });

    const mockDb = {
      insert: mockInsert,
    } as unknown as Database;

    const before = Math.floor(Date.now() / 1000);
    const result = await createInvite(mockDb, {
      createdByUserId: "usr_admin_1",
      role: "listener",
      expiresInDays: 7,
      maxUses: 1,
    });
    const after = Math.floor(Date.now() / 1000);

    expect(result.token).toHaveLength(64);
    expect(result.id).toMatch(/^inv_[a-f0-9]{16}$/);
    expect(result.role).toBe("listener");
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 7 * 86400);
    expect(result.expiresAt).toBeLessThanOrEqual(after + 7 * 86400);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("validates legitimate and unexpired invite tokens", async () => {
    const rawToken = generateSecureToken();
    const tokenHash = await hashToken(rawToken);
    const nowSeconds = Math.floor(Date.now() / 1000);

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "inv_123",
                tokenHash,
                createdBy: "usr_admin_1",
                role: "listener",
                expiresAt: nowSeconds + 3600, // 1 hour from now
                maxUses: 1,
                usedCount: 0,
              },
            ]),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await verifyInviteToken(mockDb, rawToken);
    expect(result.valid).toBe(true);
    expect(result.invite?.id).toBe("inv_123");
    expect(result.invite?.role).toBe("listener");
  });

  it("rejects non-existent tokens with invalid reason", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await verifyInviteToken(mockDb, "nonexistent-token");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid");
  });

  it("rejects expired tokens with expired reason", async () => {
    const rawToken = generateSecureToken();
    const tokenHash = await hashToken(rawToken);
    const nowSeconds = Math.floor(Date.now() / 1000);

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "inv_expired",
                tokenHash,
                createdBy: "usr_admin_1",
                role: "listener",
                expiresAt: nowSeconds - 100, // Expired 100 seconds ago
                maxUses: 1,
                usedCount: 0,
              },
            ]),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await verifyInviteToken(mockDb, rawToken);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("rejects exhausted tokens with exhausted reason", async () => {
    const rawToken = generateSecureToken();
    const tokenHash = await hashToken(rawToken);
    const nowSeconds = Math.floor(Date.now() / 1000);

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "inv_exhausted",
                tokenHash,
                createdBy: "usr_admin_1",
                role: "listener",
                expiresAt: nowSeconds + 3600,
                maxUses: 1,
                usedCount: 1, // Already used once
              },
            ]),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await verifyInviteToken(mockDb, rawToken);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("exhausted");
  });

  it("redeems valid invite token atomically", async () => {
    const rawToken = generateSecureToken();
    const tokenHash = await hashToken(rawToken);
    const nowSeconds = Math.floor(Date.now() / 1000);

    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    });

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "inv_to_redeem",
                tokenHash,
                createdBy: "usr_admin_1",
                role: "listener",
                expiresAt: nowSeconds + 3600,
                maxUses: 1,
                usedCount: 0,
              },
            ]),
          }),
        }),
      }),
      update: mockUpdate,
    } as unknown as Database;

    const success = await redeemInviteToken(mockDb, rawToken);
    expect(success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
