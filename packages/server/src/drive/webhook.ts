/**
 * audioneko: Google Drive Push Notification Webhook Engine
 * Listens for real-time changes on Google Drive via changes.watch / files.watch webhooks.
 * Triggers instant library indexing when new audiobooks are uploaded or modified.
 */

import type { Env } from "../types";
import { scanDriveLibrary } from "./scanner";
import { getGoogleAccessToken } from "./token";

export interface DriveWebhookHeaders {
  channelId?: string | null;
  channelToken?: string | null;
  resourceId?: string | null;
  resourceState?: string | null;
  channelExpiration?: string | null;
  messageNumber?: string | null;
}

export interface DriveWatchState {
  channelId: string;
  resourceId: string;
  expirationMs: number;
  folderId: string;
  webhookUrl: string;
  createdAt: number;
}

const KV_WATCH_KEY = "drive_watch_state";
const KV_TOKEN_KEY = "drive_webhook_token";

/**
 * Validates incoming Google Drive push notification headers.
 */
export function validateDriveWebhookHeaders(headers: DriveWebhookHeaders): {
  isValid: boolean;
  state: string;
  isSyncHandshake: boolean;
} {
  const state = (headers.resourceState || "").toLowerCase().trim();
  const channelId = (headers.channelId || "").trim();

  if (!channelId || !state) {
    return { isValid: false, state: "", isSyncHandshake: false };
  }

  const isSyncHandshake = state === "sync";
  return { isValid: true, state, isSyncHandshake };
}

/**
 * Handles incoming push notification webhook from Google Drive.
 */
export async function handleDrivePushNotification(
  headers: DriveWebhookHeaders,
  env: Env,
  triggerScan: typeof scanDriveLibrary = scanDriveLibrary,
): Promise<{ handled: boolean; action: string }> {
  const validation = validateDriveWebhookHeaders(headers);
  if (!validation.isValid) {
    return { handled: false, action: "invalid_headers" };
  }

  // 1. Handshake verification ping when channel is created
  if (validation.isSyncHandshake) {
    return { handled: true, action: "sync_handshake_acknowledged" };
  }

  // 2. Actionable changes: "change", "add", "update", "trash"
  if (
    validation.state === "change" ||
    validation.state === "add" ||
    validation.state === "update" ||
    validation.state === "trash"
  ) {
    try {
      // Trigger library scan to immediately index the changes into D1
      const folderId = env.GOOGLE_DRIVE_FOLDER_ID || "1Eb41o9yGeJoojEYniUZvRCjaxBziLN-Z";
      await triggerScan(env, folderId);
      return { handled: true, action: "scan_triggered" };
    } catch (err) {
      console.error("[drive-webhook] Failed to execute scan on push notification:", err);
      return { handled: true, action: "scan_failed" };
    }
  }

  return { handled: true, action: `unhandled_state_${validation.state}` };
}

/**
 * Subscribes to Google Drive push notifications using files.watch API.
 */
export async function registerDriveWatchChannel(
  env: Env,
  appUrl: string,
  customFetch: typeof fetch = fetch,
): Promise<DriveWatchState | { error: string }> {
  if (!env.GOOGLE_SA_KEY) {
    return { error: "Google Service Account key missing in environment." };
  }

  const folderId = env.GOOGLE_DRIVE_FOLDER_ID || "root";
  const token = await getGoogleAccessToken(env.GOOGLE_SA_KEY, env.KV);

  const channelId = `audioneko_watch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/drive`;
  const securityToken = `tok_${Math.random().toString(36).slice(2, 12)}`;
  // Google Drive allows watch channel duration up to 7 days (604800 seconds)
  const expirationMs = Date.now() + 6 * 24 * 60 * 60 * 1000;

  try {
    const res = await customFetch(`https://www.googleapis.com/drive/v3/files/${folderId}/watch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        token: securityToken,
        expiration: expirationMs.toString(),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { error: `Google Drive watch registration failed: ${errText}` };
    }

    const data = (await res.json()) as { id?: string; resourceId?: string };
    const watchState: DriveWatchState = {
      channelId,
      resourceId: data.resourceId || "",
      expirationMs,
      folderId,
      webhookUrl,
      createdAt: Date.now(),
    };

    if (env.KV) {
      await env.KV.put(KV_WATCH_KEY, JSON.stringify(watchState));
      await env.KV.put(KV_TOKEN_KEY, securityToken);
    }

    return watchState;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Watch registration network error" };
  }
}

/**
 * Retrieves currently active watch channel status from KV.
 */
export async function getActiveDriveWatchChannel(env: Env): Promise<DriveWatchState | null> {
  if (!env.KV) return null;
  try {
    const raw = await env.KV.get(KV_WATCH_KEY, "json");
    return (raw as DriveWatchState) || null;
  } catch {
    return null;
  }
}
