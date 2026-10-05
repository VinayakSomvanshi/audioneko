import { DurableObject } from "cloudflare:workers";
import type { BookProgressRecord, SyncClientMessage, SyncServerMessage } from "@audioneko/shared";
import { packHlc, resolveProgressConflict, unpackHlc } from "@audioneko/shared";
import type { Env } from "../types";

interface ProgressRow extends Record<string, SqlStorageValue> {
  book_id: string;
  position_seconds: number;
  duration: number;
  playback_rate: number;
  is_playing: number;
  hlc: string;
  device_id: string;
  device_name: string | null;
  updated_at: number;
}

/**
 * SyncRoom Durable Object
 *
 * Provides single-user, multi-device real-time playback synchronization.
 * Backed by SQLite on Cloudflare Durable Objects (zero-credit-card permanent free tier).
 * Implements hibernatable WebSockets for sub-10ms state sync across phone, tablet, and desktop.
 */
export class SyncRoom extends DurableObject<Env> {
  private initialized = false;

  /**
   * Initializes the SQLite schema if not already created.
   */
  private ensureSchema(): void {
    if (this.initialized) return;

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS book_progress (
        book_id TEXT PRIMARY KEY,
        position_seconds REAL NOT NULL,
        duration REAL NOT NULL,
        playback_rate REAL NOT NULL,
        is_playing INTEGER NOT NULL,
        hlc TEXT NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT,
        updated_at INTEGER NOT NULL
      )
    `);

    this.initialized = true;
  }

  /**
   * Fetches all progress records for the user.
   */
  public getAllProgress(): BookProgressRecord[] {
    this.ensureSchema();

    const cursor = this.ctx.storage.sql.exec<ProgressRow>(`
      SELECT
        book_id,
        position_seconds,
        duration,
        playback_rate,
        is_playing,
        hlc,
        device_id,
        device_name,
        updated_at
      FROM book_progress
      ORDER BY updated_at DESC
    `);

    return cursor.toArray().map((row) => ({
      bookId: row.book_id,
      currentTime: row.position_seconds,
      duration: row.duration,
      playbackRate: row.playback_rate,
      isPlaying: row.is_playing === 1,
      hlc: unpackHlc(row.hlc),
      deviceId: row.device_id,
      deviceName: row.device_name ?? undefined,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Fetches a single progress record by book ID.
   */
  public getProgress(bookId: string): BookProgressRecord | null {
    this.ensureSchema();

    const cursor = this.ctx.storage.sql.exec<ProgressRow>(
      `
      SELECT
        book_id,
        position_seconds,
        duration,
        playback_rate,
        is_playing,
        hlc,
        device_id,
        device_name,
        updated_at
      FROM book_progress
      WHERE book_id = ?
    `,
      bookId,
    );

    const rows = cursor.toArray();
    const row = rows[0];
    if (!row) return null;

    return {
      bookId: row.book_id,
      currentTime: row.position_seconds,
      duration: row.duration,
      playbackRate: row.playback_rate,
      isPlaying: row.is_playing === 1,
      hlc: unpackHlc(row.hlc),
      deviceId: row.device_id,
      deviceName: row.device_name ?? undefined,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Upserts a progress record in SQLite.
   */
  public saveProgress(record: BookProgressRecord): void {
    this.ensureSchema();

    this.ctx.storage.sql.exec(
      `
      INSERT INTO book_progress (
        book_id,
        position_seconds,
        duration,
        playback_rate,
        is_playing,
        hlc,
        device_id,
        device_name,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_id) DO UPDATE SET
        position_seconds = excluded.position_seconds,
        duration = excluded.duration,
        playback_rate = excluded.playback_rate,
        is_playing = excluded.is_playing,
        hlc = excluded.hlc,
        device_id = excluded.device_id,
        device_name = excluded.device_name,
        updated_at = excluded.updated_at
    `,
      record.bookId,
      record.currentTime,
      record.duration,
      record.playbackRate,
      record.isPlaying ? 1 : 0,
      packHlc(record.hlc),
      record.deviceId,
      record.deviceName ?? null,
      record.updatedAt,
    );
  }

  /**
   * Handles incoming HTTP and WebSocket upgrade requests.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // REST inspect endpoints (useful for debugging, testing, and server-side state hydration)
    if (url.pathname === "/state") {
      const books = this.getAllProgress();
      return Response.json({ books });
    }

    if (url.pathname.startsWith("/progress/")) {
      const bookId = url.pathname.slice("/progress/".length);
      const record = this.getProgress(bookId);
      return Response.json({ record });
    }

    // WebSocket handshake upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const clientWs = pair[0];
      const serverWs = pair[1];

      // Accept WebSocket using hibernatable API
      this.ctx.acceptWebSocket(serverWs);

      // Send initial snapshot of all book progress records to newly connected client
      const allBooks = this.getAllProgress();
      const initialMessage: SyncServerMessage = {
        type: "INITIAL_STATE",
        books: allBooks,
      };
      serverWs.send(JSON.stringify(initialMessage));

      try {
        return new Response(null, {
          status: 101,
          webSocket: clientWs,
        } as ResponseInit & { webSocket: WebSocket });
      } catch {
        // Fallback for non-Cloudflare environments (e.g. Node.js unit tests)
        return new Response(null, {
          status: 200,
          headers: { "X-WebSocket": "accepted" },
        });
      }
    }

    return new Response("SyncRoom Active", { status: 200 });
  }

  /**
   * Handles incoming WebSocket messages with hibernatable event model.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;

    try {
      const data = JSON.parse(message) as SyncClientMessage;

      if (data.type === "PING") {
        const pong: SyncServerMessage = { type: "PONG" };
        ws.send(JSON.stringify(pong));
        return;
      }

      if (data.type === "REQUEST_STATE") {
        if (data.bookId) {
          const rec = this.getProgress(data.bookId);
          const msg: SyncServerMessage = {
            type: "INITIAL_STATE",
            books: rec ? [rec] : [],
          };
          ws.send(JSON.stringify(msg));
        } else {
          const all = this.getAllProgress();
          const msg: SyncServerMessage = {
            type: "INITIAL_STATE",
            books: all,
          };
          ws.send(JSON.stringify(msg));
        }
        return;
      }

      if (data.type === "SYNC_UPDATE") {
        const existing = this.getProgress(data.bookId);
        const incoming: BookProgressRecord = {
          bookId: data.bookId,
          currentTime: data.currentTime,
          duration: data.duration,
          playbackRate: data.playbackRate,
          isPlaying: data.isPlaying,
          hlc: data.hlc,
          deviceId: data.deviceId,
          deviceName: data.deviceName,
          updatedAt: Date.now(),
        };

        const resolution = resolveProgressConflict(existing, incoming, {
          isExplicitSeek: data.isExplicitSeek,
        });

        if (resolution.updated) {
          this.saveProgress(resolution.record);

          // Acknowledge update to sender
          const ack: SyncServerMessage = {
            type: "SYNC_ACK",
            bookId: resolution.record.bookId,
            currentTime: resolution.record.currentTime,
            hlc: resolution.record.hlc,
          };
          ws.send(JSON.stringify(ack));

          // Broadcast forward progress to other connected sockets
          const broadcastMsg: SyncServerMessage = {
            type: "PROGRESS_BROADCAST",
            bookId: resolution.record.bookId,
            currentTime: resolution.record.currentTime,
            duration: resolution.record.duration,
            playbackRate: resolution.record.playbackRate,
            isPlaying: resolution.record.isPlaying,
            hlc: resolution.record.hlc,
            deviceId: resolution.record.deviceId,
            deviceName: resolution.record.deviceName,
            updatedAt: resolution.record.updatedAt,
          };
          const broadcastPayload = JSON.stringify(broadcastMsg);

          for (const socket of this.ctx.getWebSockets()) {
            if (socket !== ws) {
              try {
                socket.send(broadcastPayload);
              } catch {
                // Ignore disconnected sockets; runtime will trigger webSocketClose
              }
            }
          }
        } else {
          // Stale update rejected by HLC. Send ACK with authoritative state.
          const ack: SyncServerMessage = {
            type: "SYNC_ACK",
            bookId: resolution.record.bookId,
            currentTime: resolution.record.currentTime,
            hlc: resolution.record.hlc,
          };
          ws.send(JSON.stringify(ack));
        }
      }
    } catch (err) {
      console.error("Failed to process WebSocket message in SyncRoom:", err);
    }
  }

  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    // Handled automatically by Cloudflare runtime hibernatable socket pool
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.error("WebSocket error in SyncRoom:", error);
  }
}
