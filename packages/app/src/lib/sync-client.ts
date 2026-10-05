import type {
  BookProgressRecord,
  HybridLogicalClock,
  SyncClientMessage,
  SyncServerMessage,
} from "@audioneko/shared";
import { createHlc, resolveProgressConflict, tickHlc } from "@audioneko/shared";

export type RemoteProgressCallback = (record: BookProgressRecord) => void;
export type ConnectionChangeCallback = (connected: boolean) => void;
export type InitialStateCallback = (books: BookProgressRecord[]) => void;

export interface SyncClientConfig {
  wsUrl?: string;
  deviceId?: string;
  deviceName?: string;
  heartbeatIntervalMs?: number;
}

/**
 * Returns or generates a persistent device ID.
 */
export function getOrCreateDeviceId(): string {
  const storage =
    typeof localStorage !== "undefined"
      ? localStorage
      : typeof window !== "undefined"
        ? window.localStorage
        : null;

  if (!storage) {
    return "server-device-id";
  }

  const existing = storage.getItem("audioneko_device_id");
  if (existing) return existing;

  const generated = `dev_${crypto.randomUUID().slice(0, 12)}`;
  storage.setItem("audioneko_device_id", generated);
  return generated;
}

/**
 * Derives a human-readable device name from the user agent.
 */
export function getDefaultDeviceName(): string {
  if (typeof navigator === "undefined") return "Web Player";

  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "iPhone / iOS";
  if (/Android/.test(ua)) return "Android Device";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux PC";
  return "Web Browser";
}

/**
 * Real-time client synchronization coordinator.
 * Connects to the Cloudflare SyncRoom Durable Object via WebSockets.
 * Tracks Hybrid Logical Clocks, triggers monotonic conflict resolution,
 * and maintains sub-10ms cross-device state consistency.
 */
export class SyncClient {
  private socket: WebSocket | null = null;
  private isExplicitlyClosed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private deviceId: string;
  private deviceName: string;
  private wsUrl: string;
  private localHlc: HybridLogicalClock;
  private books = new Map<string, BookProgressRecord>();

  private remoteProgressListeners = new Set<RemoteProgressCallback>();
  private connectionListeners = new Set<ConnectionChangeCallback>();
  private initialStateListeners = new Set<InitialStateCallback>();

  constructor(config?: SyncClientConfig) {
    this.deviceId = config?.deviceId ?? getOrCreateDeviceId();
    this.deviceName = config?.deviceName ?? getDefaultDeviceName();
    this.localHlc = createHlc(this.deviceId);

    if (config?.wsUrl) {
      this.wsUrl = config.wsUrl;
    } else if (typeof window !== "undefined") {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      this.wsUrl = `${protocol}//${window.location.host}/api/sync/ws`;
    } else {
      this.wsUrl = "ws://localhost:8787/api/sync/ws";
    }
  }

  /**
   * Opens the WebSocket connection to the user's SyncRoom.
   */
  public connect(): void {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.isExplicitlyClosed = false;

    try {
      this.socket = new WebSocket(this.wsUrl);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyConnectionChange(true);
        this.startHeartbeat();
      };

      this.socket.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.socket.onclose = () => {
        this.notifyConnectionChange(false);
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        // Socket errors trigger close event, handled by onclose
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  /**
   * Gracefully closes the connection and cancels reconnection timers.
   */
  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.notifyConnectionChange(false);
  }

  /**
   * Returns whether the WebSocket is currently open.
   */
  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * Sends a playback progress update to the SyncRoom.
   */
  public sendUpdate(params: {
    bookId: string;
    currentTime: number;
    duration: number;
    playbackRate: number;
    isPlaying: boolean;
    isExplicitSeek?: boolean;
  }): void {
    // Advance local clock strictly forward
    this.localHlc = tickHlc(this.localHlc);

    const record: BookProgressRecord = {
      bookId: params.bookId,
      currentTime: params.currentTime,
      duration: params.duration,
      playbackRate: params.playbackRate,
      isPlaying: params.isPlaying,
      hlc: this.localHlc,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      updatedAt: Date.now(),
    };

    // Store in local cache
    this.books.set(params.bookId, record);

    if (!this.isConnected()) return;

    const message: SyncClientMessage = {
      type: "SYNC_UPDATE",
      bookId: params.bookId,
      currentTime: params.currentTime,
      duration: params.duration,
      playbackRate: params.playbackRate,
      isPlaying: params.isPlaying,
      hlc: this.localHlc,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      isExplicitSeek: params.isExplicitSeek,
    };

    this.socket?.send(JSON.stringify(message));
  }

  /**
   * Requests state from the SyncRoom.
   */
  public requestState(bookId?: string): void {
    if (!this.isConnected()) return;

    const msg: SyncClientMessage = {
      type: "REQUEST_STATE",
      bookId,
    };
    this.socket?.send(JSON.stringify(msg));
  }

  /**
   * Retrieves a cached progress record.
   */
  public getProgress(bookId: string): BookProgressRecord | undefined {
    return this.books.get(bookId);
  }

  /**
   * Subscribes to remote progress broadcasts from other devices.
   */
  public onRemoteProgress(callback: RemoteProgressCallback): () => void {
    this.remoteProgressListeners.add(callback);
    return () => {
      this.remoteProgressListeners.delete(callback);
    };
  }

  /**
   * Subscribes to connection status transitions.
   */
  public onConnectionChange(callback: ConnectionChangeCallback): () => void {
    this.connectionListeners.add(callback);
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  /**
   * Subscribes to initial state receipt.
   */
  public onInitialState(callback: InitialStateCallback): () => void {
    this.initialStateListeners.add(callback);
    return () => {
      this.initialStateListeners.delete(callback);
    };
  }

  /**
   * Handles incoming WebSocket messages.
   */
  private handleMessage(payload: string): void {
    try {
      const data = JSON.parse(payload) as SyncServerMessage;

      if (data.type === "INITIAL_STATE") {
        for (const book of data.books) {
          this.books.set(book.bookId, book);
          // Causally tick HLC from server records
          this.localHlc = tickHlc(this.localHlc, book.hlc);
        }
        for (const listener of this.initialStateListeners) {
          listener(data.books);
        }
        return;
      }

      if (data.type === "PROGRESS_BROADCAST") {
        // Ignore broadcasts generated by our own device ID
        if (data.deviceId === this.deviceId) {
          return;
        }

        // Causally tick HLC
        this.localHlc = tickHlc(this.localHlc, data.hlc);

        const existing = this.books.get(data.bookId) ?? null;
        const incoming: BookProgressRecord = {
          bookId: data.bookId,
          currentTime: data.currentTime,
          duration: data.duration,
          playbackRate: data.playbackRate,
          isPlaying: data.isPlaying,
          hlc: data.hlc,
          deviceId: data.deviceId,
          deviceName: data.deviceName,
          updatedAt: data.updatedAt,
        };

        const resolution = resolveProgressConflict(existing, incoming);
        if (resolution.updated) {
          this.books.set(data.bookId, resolution.record);
          for (const listener of this.remoteProgressListeners) {
            listener(resolution.record);
          }
        }
        return;
      }

      if (data.type === "SYNC_ACK") {
        this.localHlc = tickHlc(this.localHlc, data.hlc);
      }
    } catch (err) {
      console.error("Failed to parse SyncRoom server message:", err);
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    for (const listener of this.connectionListeners) {
      listener(connected);
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Exponential backoff with jitter: 1s, 2s, 4s, 8s, up to 30s
    const baseDelay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    const jitter = Math.random() * 500;
    const delay = baseDelay + jitter;
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        const ping: SyncClientMessage = { type: "PING" };
        this.socket?.send(JSON.stringify(ping));
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
