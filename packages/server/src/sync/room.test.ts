import { DatabaseSync } from "node:sqlite";
import type { BookProgressRecord, SyncClientMessage, SyncServerMessage } from "@audioneko/shared";
import { createHlc } from "@audioneko/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../types";
import { SyncRoom } from "./room";

class MockWebSocket {
  public sent: string[] = [];
  public readyState = 1;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  getLastJson<T>(): T | null {
    if (this.sent.length === 0) return null;
    return JSON.parse(this.sent[this.sent.length - 1] as string) as T;
  }
}

class MockWebSocketPair {
  0: MockWebSocket;
  1: MockWebSocket;
  constructor() {
    this[0] = new MockWebSocket();
    this[1] = new MockWebSocket();
  }
}

describe("SyncRoom Durable Object with SQLite & Hibernatable WebSockets", () => {
  let sqliteDb: DatabaseSync;
  let activeWebSockets: Set<MockWebSocket>;
  let mockCtx: DurableObjectState;
  let mockEnv: Env;
  let room: SyncRoom;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).WebSocketPair = MockWebSocketPair;

    sqliteDb = new DatabaseSync(":memory:");
    activeWebSockets = new Set<MockWebSocket>();

    mockCtx = {
      storage: {
        sql: {
          exec: (query: string, ...bindings: (string | number | null)[]) => {
            const trimmed = query.trim();
            if (
              trimmed.startsWith("CREATE") ||
              trimmed.startsWith("INSERT") ||
              trimmed.startsWith("UPDATE") ||
              trimmed.startsWith("DELETE")
            ) {
              if (bindings.length > 0) {
                const stmt = sqliteDb.prepare(query);
                stmt.run(...(bindings as (string | number | bigint | null)[]));
              } else {
                sqliteDb.exec(query);
              }
              return {
                toArray: () => [],
              };
            }

            const stmt = sqliteDb.prepare(query);
            const rows = stmt.all(...(bindings as (string | number | bigint | null)[]));
            return {
              toArray: () => rows,
            };
          },
        },
      },
      acceptWebSocket: (ws: WebSocket) => {
        activeWebSockets.add(ws as unknown as MockWebSocket);
      },
      getWebSockets: () => Array.from(activeWebSockets) as unknown as WebSocket[],
    } as unknown as DurableObjectState;

    mockEnv = {} as Env;
    room = new SyncRoom(mockCtx, mockEnv);
  });

  afterEach(() => {
    sqliteDb.close();
  });

  it("initializes schema and saves/retrieves book progress cleanly", () => {
    const record: BookProgressRecord = {
      bookId: "book-test-1",
      currentTime: 142.5,
      duration: 3600,
      playbackRate: 1.25,
      isPlaying: true,
      hlc: createHlc("client-macbook", 1728000000000),
      deviceId: "client-macbook",
      deviceName: "MacBook Pro",
      updatedAt: 1728000000000,
    };

    room.saveProgress(record);

    const saved = room.getProgress("book-test-1");
    expect(saved).not.toBeNull();
    expect(saved?.bookId).toBe("book-test-1");
    expect(saved?.currentTime).toBe(142.5);
    expect(saved?.isPlaying).toBe(true);
    expect(saved?.deviceName).toBe("MacBook Pro");

    const all = room.getAllProgress();
    expect(all).toHaveLength(1);
    expect(all[0]?.bookId).toBe("book-test-1");
  });

  it("handles WebSocket upgrade and sends INITIAL_STATE", async () => {
    // Save an initial book
    room.saveProgress({
      bookId: "book-existing",
      currentTime: 500,
      duration: 1000,
      playbackRate: 1.0,
      isPlaying: false,
      hlc: createHlc("phone", 1000),
      deviceId: "phone",
      updatedAt: 1000,
    });

    const request = new Request("https://sync/ws", {
      headers: { Upgrade: "websocket" },
    });

    const response = await room.fetch(request);
    expect([101, 200]).toContain(response.status);

    // Verify server socket received INITIAL_STATE
    const serverSockets = Array.from(activeWebSockets);
    expect(serverSockets).toHaveLength(1);

    const serverWs = serverSockets[0];
    const initialMsg = serverWs?.getLastJson<SyncServerMessage>();
    expect(initialMsg?.type).toBe("INITIAL_STATE");
    if (initialMsg?.type === "INITIAL_STATE") {
      expect(initialMsg.books).toHaveLength(1);
      expect(initialMsg.books[0]?.bookId).toBe("book-existing");
    }
  });

  it("responds to PING with PONG", async () => {
    const ws = new MockWebSocket();
    await room.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "PING" } satisfies SyncClientMessage),
    );

    const reply = ws.getLastJson<SyncServerMessage>();
    expect(reply?.type).toBe("PONG");
  });

  it("handles REQUEST_STATE for a specific book", async () => {
    room.saveProgress({
      bookId: "book-42",
      currentTime: 100,
      duration: 500,
      playbackRate: 1.0,
      isPlaying: false,
      hlc: createHlc("client", 100),
      deviceId: "client",
      updatedAt: 100,
    });

    const ws = new MockWebSocket();
    await room.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        type: "REQUEST_STATE",
        bookId: "book-42",
      } satisfies SyncClientMessage),
    );

    const reply = ws.getLastJson<SyncServerMessage>();
    expect(reply?.type).toBe("INITIAL_STATE");
    if (reply?.type === "INITIAL_STATE") {
      expect(reply.books).toHaveLength(1);
      expect(reply.books[0]?.bookId).toBe("book-42");
    }
  });

  it("processes SYNC_UPDATE, sends SYNC_ACK to sender, and broadcasts to other sockets", async () => {
    const senderWs = new MockWebSocket();
    const otherWs = new MockWebSocket();

    mockCtx.acceptWebSocket(senderWs as unknown as WebSocket);
    mockCtx.acceptWebSocket(otherWs as unknown as WebSocket);

    const updateMsg: SyncClientMessage = {
      type: "SYNC_UPDATE",
      bookId: "book-dune",
      currentTime: 1540.2,
      duration: 7200,
      playbackRate: 1.15,
      isPlaying: true,
      hlc: createHlc("phone-client", 5000),
      deviceId: "phone-client",
      deviceName: "Pixel 9",
    };

    await room.webSocketMessage(senderWs as unknown as WebSocket, JSON.stringify(updateMsg));

    // Sender gets SYNC_ACK
    const ack = senderWs.getLastJson<SyncServerMessage>();
    expect(ack?.type).toBe("SYNC_ACK");
    if (ack?.type === "SYNC_ACK") {
      expect(ack.bookId).toBe("book-dune");
      expect(ack.currentTime).toBe(1540.2);
    }

    // Other socket receives PROGRESS_BROADCAST
    const broadcast = otherWs.getLastJson<SyncServerMessage>();
    expect(broadcast?.type).toBe("PROGRESS_BROADCAST");
    if (broadcast?.type === "PROGRESS_BROADCAST") {
      expect(broadcast.bookId).toBe("book-dune");
      expect(broadcast.currentTime).toBe(1540.2);
      expect(broadcast.isPlaying).toBe(true);
      expect(broadcast.deviceName).toBe("Pixel 9");
    }

    // State is persisted in SQLite
    const saved = room.getProgress("book-dune");
    expect(saved?.currentTime).toBe(1540.2);
    expect(saved?.isPlaying).toBe(true);
  });

  it("applies monotonic safeguard: preserves forward position when background tab sends pause", async () => {
    // 1. Mobile actively listened to position 3000 at HLC 10000
    room.saveProgress({
      bookId: "book-monolith",
      currentTime: 3000,
      duration: 10000,
      playbackRate: 1.0,
      isPlaying: true,
      hlc: createHlc("mobile", 10000),
      deviceId: "mobile",
      updatedAt: 10000,
    });

    const desktopWs = new MockWebSocket();
    mockCtx.acceptWebSocket(desktopWs as unknown as WebSocket);

    // 2. Desktop was left behind at 1200, and sends pause update with newer HLC 12000
    const stalePauseMsg: SyncClientMessage = {
      type: "SYNC_UPDATE",
      bookId: "book-monolith",
      currentTime: 1200,
      duration: 10000,
      playbackRate: 1.0,
      isPlaying: false,
      hlc: createHlc("desktop", 12000),
      deviceId: "desktop",
      isExplicitSeek: false,
    };

    await room.webSocketMessage(desktopWs as unknown as WebSocket, JSON.stringify(stalePauseMsg));

    // Authoritative position in SQLite must NOT regress to 1200!
    const current = room.getProgress("book-monolith");
    expect(current?.currentTime).toBe(3000);
    expect(current?.isPlaying).toBe(false); // Playing state correctly updated to false
  });

  it("handles external REST POST /progress/:bookId and broadcasts to active WebSockets", async () => {
    const ws = new MockWebSocket();
    mockCtx.acceptWebSocket(ws as unknown as WebSocket);

    const postReq = new Request("https://sync/progress/book-rest-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentTime: 2450,
        duration: 9000,
        updatedAt: 1234567890,
        deviceName: "Mobile Phone",
        deviceId: "mobile-id",
      }),
    });

    const res = await room.fetch(postReq);
    expect(res.status).toBe(200);

    const record = room.getProgress("book-rest-sync");
    expect(record?.currentTime).toBe(2450);
    expect(record?.duration).toBe(9000);
    expect(record?.deviceName).toBe("Mobile Phone");

    // WebSocket received broadcast
    const broadcast = ws.getLastJson<SyncServerMessage>();
    expect(broadcast?.type).toBe("PROGRESS_BROADCAST");
    if (broadcast && broadcast.type === "PROGRESS_BROADCAST") {
      expect(broadcast.bookId).toBe("book-rest-sync");
      expect(broadcast.currentTime).toBe(2450);
    }
  });
});
