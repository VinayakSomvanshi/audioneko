/**
 * audioneko: Listen-Along Synchronous Room Durable Object
 *
 * Coordinates multi-user synchronized playback rooms with authoritative epoch timestamps
 * and real-time WebSocket state broadcasting.
 */

import type {
  ListenAlongClientMessage,
  ListenAlongRoomState,
  ListenAlongServerMessage,
} from "@audioneko/shared";
import type { Env } from "../types";

export class ListenAlongRoom implements DurableObject {
  private ctx: DurableObjectState;
  private env: Env;
  private state: ListenAlongRoomState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;

    // Load initial room state from Durable Object storage
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<ListenAlongRoomState>("room_state");
      if (stored) {
        this.state = stored;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // REST route: GET /state
    if (url.pathname.endsWith("/state")) {
      const listenerCount = this.ctx.getWebSockets().length;
      return new Response(
        JSON.stringify({
          state: this.state ? { ...this.state, listenersCount: listenerCount } : null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // WebSocket upgrade route
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    // Parse query params for initial user credentials
    const userId = url.searchParams.get("userId") || "anonymous";
    const userName = url.searchParams.get("userName") || "Listener";
    const roomId = url.searchParams.get("roomId") || "global-room";
    const isHost = url.searchParams.get("isHost") === "true";

    // Set up WebSocket pair
    const webSocketPair = new WebSocketPair();
    const [client, server] = [webSocketPair[0], webSocketPair[1]];

    this.ctx.acceptWebSocket(server, [isHost ? "host" : "listener", `user:${userId}`]);

    // Initialize state if host creates the room
    if (isHost && (!this.state || this.state.roomId !== roomId)) {
      this.state = {
        roomId,
        hostUserId: userId,
        hostName: userName,
        bookId: url.searchParams.get("bookId") || "",
        positionSeconds: 0,
        isPlaying: false,
        playbackRate: 1.0,
        epochSnapshotTime: Date.now(),
        listenersCount: 1,
      };
      await this.ctx.storage.put("room_state", this.state);
    }

    // Send initial room state to newly connected client
    const currentListeners = this.ctx.getWebSockets().length;
    if (this.state) {
      server.send(
        JSON.stringify({
          type: "ROOM_STATE",
          state: { ...this.state, listenersCount: currentListeners },
        } satisfies ListenAlongServerMessage),
      );
    }

    // Broadcast updated listener count to all participants
    this.broadcast({
      type: "LISTENER_COUNT",
      count: currentListeners,
    });

    try {
      return new Response(null, {
        status: 101,
        webSocket: client,
      } as ResponseInit);
    } catch {
      return new Response(null, {
        status: 200,
        webSocket: client,
      } as ResponseInit);
    }
  }

  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;

    try {
      const data = JSON.parse(message) as ListenAlongClientMessage;

      if (data.type === "HOST_UPDATE") {
        // Authoritative update from the host
        const now = Date.now();
        if (this.state) {
          this.state.bookId = data.bookId;
          this.state.positionSeconds = data.positionSeconds;
          this.state.isPlaying = data.isPlaying;
          this.state.playbackRate = data.playbackRate;
          this.state.epochSnapshotTime = now;

          await this.ctx.storage.put("room_state", this.state);
        }

        // Broadcast to all connected listeners
        this.broadcast({
          type: "HOST_STATE_BROADCAST",
          bookId: data.bookId,
          positionSeconds: data.positionSeconds,
          isPlaying: data.isPlaying,
          playbackRate: data.playbackRate,
          epochSnapshotTime: now,
        });
      }
    } catch {
      // Ignore malformed messages
    }
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    const remainingCount = this.ctx.getWebSockets().length;
    this.broadcast({
      type: "LISTENER_COUNT",
      count: remainingCount,
    });
  }

  async webSocketError(_ws: WebSocket, error?: unknown): Promise<void> {
    console.error("WebSocket error in ListenAlongRoom:", error);
  }

  /**
   * Broadcasts a JSON message to all connected WebSocket clients
   */
  private broadcast(msg: ListenAlongServerMessage): void {
    const payload = JSON.stringify(msg);
    const clients = this.ctx.getWebSockets();
    for (const ws of clients) {
      try {
        ws.send(payload);
      } catch {
        // Closed socket will be cleaned up
      }
    }
  }
}
