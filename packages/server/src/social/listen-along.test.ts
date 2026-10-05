import type { ListenAlongClientMessage, ListenAlongServerMessage } from "@audioneko/shared";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { ListenAlongRoom } from "./listen-along";

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

// Attach MockWebSocketPair to globalThis for Node test environment
(globalThis as unknown as { WebSocketPair: typeof MockWebSocketPair }).WebSocketPair =
  MockWebSocketPair;

describe("ListenAlongRoom Durable Object", () => {
  it("initializes room state on host connection and broadcasts host updates", async () => {
    const memoryStorage = new Map<string, unknown>();
    const acceptedSockets: MockWebSocket[] = [];

    const mockCtx = {
      storage: {
        get: vi.fn().mockImplementation((key: string) => Promise.resolve(memoryStorage.get(key))),
        put: vi.fn().mockImplementation((key: string, val: unknown) => {
          memoryStorage.set(key, val);
          return Promise.resolve();
        }),
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn: () => Promise<void>) => {
        await fn();
      }),
      acceptWebSocket: vi.fn().mockImplementation((ws: MockWebSocket) => {
        acceptedSockets.push(ws);
      }),
      getWebSockets: vi.fn().mockImplementation(() => acceptedSockets),
    } as unknown as DurableObjectState;

    const mockEnv = {} as Env;
    const room = new ListenAlongRoom(mockCtx, mockEnv);

    // Host connects to room
    const hostReq = new Request(
      "https://audioneko.app/api/social/rooms/room_1/ws?userId=usr_host&userName=HostUser&roomId=room_1&isHost=true&bookId=book_alpha",
      {
        headers: { Upgrade: "websocket" },
      },
    );

    const hostRes = await room.fetch(hostReq);
    expect([101, 200]).toContain(hostRes.status);
    expect(acceptedSockets).toHaveLength(1);

    // Follower connects to room
    const followerReq = new Request(
      "https://audioneko.app/api/social/rooms/room_1/ws?userId=usr_follower&userName=FollowerUser&roomId=room_1&isHost=false",
      {
        headers: { Upgrade: "websocket" },
      },
    );

    const followerRes = await room.fetch(followerReq);
    expect([101, 200]).toContain(followerRes.status);
    expect(acceptedSockets).toHaveLength(2);

    // Follower should have received initial room state
    const followerSocket = acceptedSockets[1];
    expect(followerSocket?.sent.length).toBeGreaterThan(0);
    const firstMsg = JSON.parse(followerSocket?.sent[0] as string) as ListenAlongServerMessage;
    expect(firstMsg.type).toBe("ROOM_STATE");
    if (firstMsg.type === "ROOM_STATE") {
      expect(firstMsg.state.bookId).toBe("book_alpha");
      expect(firstMsg.state.hostUserId).toBe("usr_host");
    }

    // Host sends a playback update
    const updateMsg: ListenAlongClientMessage = {
      type: "HOST_UPDATE",
      bookId: "book_alpha",
      positionSeconds: 145.5,
      isPlaying: true,
      playbackRate: 1.25,
    };

    const hostSocket = acceptedSockets[0];
    await room.webSocketMessage(hostSocket as unknown as WebSocket, JSON.stringify(updateMsg));

    // Follower should have received HOST_STATE_BROADCAST
    const lastFollowerMsg = followerSocket?.getLastJson<ListenAlongServerMessage>();
    expect(lastFollowerMsg?.type).toBe("HOST_STATE_BROADCAST");
    if (lastFollowerMsg?.type === "HOST_STATE_BROADCAST") {
      expect(lastFollowerMsg.bookId).toBe("book_alpha");
      expect(lastFollowerMsg.positionSeconds).toBe(145.5);
      expect(lastFollowerMsg.isPlaying).toBe(true);
      expect(lastFollowerMsg.playbackRate).toBe(1.25);
      expect(lastFollowerMsg.epochSnapshotTime).toBeGreaterThan(0);
    }

    // REST route: GET /state
    const stateReq = new Request("https://room/state");
    const stateRes = await room.fetch(stateReq);
    expect(stateRes.status).toBe(200);
    const stateJson = (await stateRes.json()) as { state: { positionSeconds: number } };
    expect(stateJson.state.positionSeconds).toBe(145.5);
  });
});
