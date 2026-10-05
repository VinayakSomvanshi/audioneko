import type { BookProgressRecord, SyncServerMessage } from "@audioneko/shared";
import { createHlc } from "@audioneko/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncClient, getDefaultDeviceName, getOrCreateDeviceId } from "./sync-client";

class MockClientWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSING = 2;
  public readonly CLOSED = 3;

  public static instances: MockClientWebSocket[] = [];
  public readyState = 0; // CONNECTING
  public url: string;
  public sent: string[] = [];

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((error: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockClientWebSocket.instances.push(this);
    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.();
    }, 5);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  simulateServerMessage(msg: SyncServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

describe("SyncClient WebSocket Real-Time Synchronization", () => {
  beforeEach(() => {
    MockClientWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockClientWebSocket);

    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists and reuses device ID across sessions", () => {
    const id1 = getOrCreateDeviceId();
    const id2 = getOrCreateDeviceId();
    expect(id1).toBe(id2);
    expect(id1.startsWith("dev_")).toBe(true);
  });

  it("derives friendly default device name", () => {
    const name = getDefaultDeviceName();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  it("connects to WebSocket and tracks open status", async () => {
    const client = new SyncClient({
      wsUrl: "ws://test/api/sync/ws",
      deviceId: "dev_unit_test",
      deviceName: "Test Runner",
    });

    const connChanges: boolean[] = [];
    client.onConnectionChange((connected) => connChanges.push(connected));

    client.connect();

    // Wait for connection simulation
    await new Promise((r) => setTimeout(r, 15));

    expect(client.isConnected()).toBe(true);
    expect(connChanges).toContain(true);

    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it("sends playback update with local HLC and caches state", async () => {
    const client = new SyncClient({
      wsUrl: "ws://test/api/sync/ws",
      deviceId: "dev_sender",
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    client.sendUpdate({
      bookId: "book-test",
      currentTime: 120.5,
      duration: 3600,
      playbackRate: 1.0,
      isPlaying: true,
    });

    const cached = client.getProgress("book-test");
    expect(cached?.currentTime).toBe(120.5);
    expect(cached?.isPlaying).toBe(true);

    const ws = MockClientWebSocket.instances[0];
    expect(ws?.sent).toHaveLength(1);

    const sentPayload = JSON.parse(ws?.sent[0] as string);
    expect(sentPayload.type).toBe("SYNC_UPDATE");
    expect(sentPayload.bookId).toBe("book-test");
    expect(sentPayload.currentTime).toBe(120.5);
  });

  it("processes INITIAL_STATE from server", async () => {
    const client = new SyncClient({
      wsUrl: "ws://test/api/sync/ws",
      deviceId: "dev_client_1",
    });

    let receivedInitial: BookProgressRecord[] = [];
    client.onInitialState((books) => {
      receivedInitial = books;
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    const ws = MockClientWebSocket.instances[0];
    const initialRecord: BookProgressRecord = {
      bookId: "book-state",
      currentTime: 450,
      duration: 1800,
      playbackRate: 1.25,
      isPlaying: false,
      hlc: createHlc("remote_device", 1000),
      deviceId: "remote_device",
      updatedAt: 1000,
    };

    ws?.simulateServerMessage({
      type: "INITIAL_STATE",
      books: [initialRecord],
    });

    expect(receivedInitial).toHaveLength(1);
    expect(client.getProgress("book-state")?.currentTime).toBe(450);
  });

  it("ignores PROGRESS_BROADCAST originating from own device ID", async () => {
    const client = new SyncClient({
      wsUrl: "ws://test/api/sync/ws",
      deviceId: "my_phone",
    });

    const remoteUpdates: BookProgressRecord[] = [];
    client.onRemoteProgress((rec) => remoteUpdates.push(rec));

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    const ws = MockClientWebSocket.instances[0];
    ws?.simulateServerMessage({
      type: "PROGRESS_BROADCAST",
      bookId: "book-self",
      currentTime: 200,
      duration: 1000,
      playbackRate: 1.0,
      isPlaying: true,
      hlc: createHlc("my_phone", 5000),
      deviceId: "my_phone", // Same as client
      updatedAt: 5000,
    });

    expect(remoteUpdates).toHaveLength(0);
  });

  it("triggers callback on remote device progress broadcast", async () => {
    const client = new SyncClient({
      wsUrl: "ws://test/api/sync/ws",
      deviceId: "laptop",
    });

    const remoteUpdates: BookProgressRecord[] = [];
    client.onRemoteProgress((rec) => remoteUpdates.push(rec));

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    const ws = MockClientWebSocket.instances[0];
    ws?.simulateServerMessage({
      type: "PROGRESS_BROADCAST",
      bookId: "book-remote",
      currentTime: 850,
      duration: 2000,
      playbackRate: 1.1,
      isPlaying: true,
      hlc: createHlc("ipad", 8000),
      deviceId: "ipad",
      deviceName: "iPad Air",
      updatedAt: 8000,
    });

    expect(remoteUpdates).toHaveLength(1);
    expect(remoteUpdates[0]?.currentTime).toBe(850);
    expect(remoteUpdates[0]?.deviceName).toBe("iPad Air");
  });
});
