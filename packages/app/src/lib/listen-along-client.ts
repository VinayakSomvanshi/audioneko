/**
 * audioneko: Listen-Along Client WebSocket Manager & Clock Slewer
 *
 * Coordinates follower synchronization with the authoritative host clock
 * using dynamic rate slewing and zero-audio-pop alignment.
 */

import {
  type ListenAlongClientMessage,
  type ListenAlongRoomState,
  type ListenAlongServerMessage,
  computeClockSlewing,
  computeTargetHostPosition,
} from "@audioneko/shared";

export interface ListenAlongCallbacks {
  onStateChange: (state: ListenAlongRoomState) => void;
  onHardSeek: (targetSeconds: number) => void;
  onRateAdjustment: (targetRate: number) => void;
  onListenerCountChange: (count: number) => void;
  onConnectionChange: (connected: boolean) => void;
}

export class ListenAlongClient {
  private ws: WebSocket | null = null;
  private roomId: string;
  private userId: string;
  private userName: string;
  private isHost: boolean;
  private bookId: string;
  private callbacks: ListenAlongCallbacks;
  private isDestroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHostState: ListenAlongRoomState | null = null;

  constructor(
    roomId: string,
    userId: string,
    userName: string,
    isHost: boolean,
    bookId: string,
    callbacks: ListenAlongCallbacks,
  ) {
    this.roomId = roomId;
    this.userId = userId;
    this.userName = userName;
    this.isHost = isHost;
    this.bookId = bookId;
    this.callbacks = callbacks;

    this.connect();
  }

  private connect(): void {
    if (this.isDestroyed) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const url = `${protocol}//${host}/api/social/rooms/${this.roomId}/ws?userId=${encodeURIComponent(
        this.userId,
      )}&userName=${encodeURIComponent(this.userName)}&roomId=${encodeURIComponent(
        this.roomId,
      )}&isHost=${this.isHost ? "true" : "false"}&bookId=${encodeURIComponent(this.bookId)}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.callbacks.onConnectionChange(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ListenAlongServerMessage;
          this.handleServerMessage(msg);
        } catch {
          // Ignore malformed message
        }
      };

      this.ws.onclose = () => {
        this.callbacks.onConnectionChange(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private handleServerMessage(msg: ListenAlongServerMessage): void {
    if (msg.type === "ROOM_STATE") {
      this.lastHostState = msg.state;
      this.callbacks.onStateChange(msg.state);
      this.callbacks.onListenerCountChange(msg.state.listenersCount);
    } else if (msg.type === "LISTENER_COUNT") {
      this.callbacks.onListenerCountChange(msg.count);
    } else if (msg.type === "HOST_STATE_BROADCAST") {
      if (this.isHost) return; // Host is source of truth

      const state: ListenAlongRoomState = {
        roomId: this.roomId,
        hostUserId: "host",
        hostName: "Host",
        bookId: msg.bookId,
        positionSeconds: msg.positionSeconds,
        isPlaying: msg.isPlaying,
        playbackRate: msg.playbackRate,
        epochSnapshotTime: msg.epochSnapshotTime,
        listenersCount: this.lastHostState?.listenersCount || 1,
      };

      this.lastHostState = state;
      this.callbacks.onStateChange(state);
    }
  }

  /**
   * Called by follower player tick to align follower with host clock
   */
  public evaluateClockAlignment(currentFollowerPosition: number, baseRate: number): void {
    if (this.isHost || !this.lastHostState) return;

    const targetPos = computeTargetHostPosition(
      this.lastHostState.positionSeconds,
      this.lastHostState.epochSnapshotTime,
      Date.now(),
      this.lastHostState.playbackRate,
      this.lastHostState.isPlaying,
    );

    const slewing = computeClockSlewing(
      targetPos,
      currentFollowerPosition,
      baseRate,
      this.lastHostState.isPlaying,
    );

    if (slewing.requiresHardSeek && typeof slewing.seekTargetSeconds === "number") {
      this.callbacks.onHardSeek(slewing.seekTargetSeconds);
    } else {
      this.callbacks.onRateAdjustment(slewing.targetRate);
    }
  }

  /**
   * Host sends authoritative playback state to room
   */
  public broadcastHostUpdate(
    positionSeconds: number,
    isPlaying: boolean,
    playbackRate: number,
  ): void {
    if (!this.isHost || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const msg: ListenAlongClientMessage = {
      type: "HOST_UPDATE",
      bookId: this.bookId,
      positionSeconds,
      isPlaying,
      playbackRate,
    };

    this.ws.send(JSON.stringify(msg));
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
