import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { handleDrivePushNotification, validateDriveWebhookHeaders } from "./webhook";

describe("Google Drive Push Notification Webhook", () => {
  it("rejects notifications with missing channel ID or state", () => {
    expect(validateDriveWebhookHeaders({}).isValid).toBe(false);
    expect(validateDriveWebhookHeaders({ channelId: "ch-123", resourceState: "" }).isValid).toBe(
      false,
    );
  });

  it("identifies sync handshake verification pings", () => {
    const res = validateDriveWebhookHeaders({
      channelId: "ch-123",
      resourceState: "sync",
    });
    expect(res.isValid).toBe(true);
    expect(res.isSyncHandshake).toBe(true);
  });

  it("handles sync handshake without triggering a scan", async () => {
    const mockScan = vi.fn();
    const mockEnv = {} as unknown as Env;

    const res = await handleDrivePushNotification(
      { channelId: "ch-123", resourceState: "sync" },
      mockEnv,
      mockScan,
    );

    expect(res.handled).toBe(true);
    expect(res.action).toBe("sync_handshake_acknowledged");
    expect(mockScan).not.toHaveBeenCalled();
  });

  it("triggers instant library scan on 'change', 'add', or 'update' events", async () => {
    const mockScan = vi.fn().mockResolvedValue({ success: true, totalAudiobooks: 5 });
    const mockEnv = {} as unknown as Env;

    const res = await handleDrivePushNotification(
      {
        channelId: "ch-123",
        resourceState: "change",
        resourceId: "res-456",
        messageNumber: "1",
      },
      mockEnv,
      mockScan,
    );

    expect(res.handled).toBe(true);
    expect(res.action).toBe("scan_triggered");
    expect(mockScan).toHaveBeenCalledWith(mockEnv, "1Eb41o9yGeJoojEYniUZvRCjaxBziLN-Z");
  });

  it("returns scan_failed if scanner throws an exception", async () => {
    const mockScan = vi.fn().mockRejectedValue(new Error("Drive API rate limit"));
    const mockEnv = {} as unknown as Env;

    const res = await handleDrivePushNotification(
      { channelId: "ch-123", resourceState: "update" },
      mockEnv,
      mockScan,
    );

    expect(res.handled).toBe(true);
    expect(res.action).toBe("scan_failed");
  });
});
