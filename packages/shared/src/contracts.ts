import type { Book, Chapter, Progress } from "./schema";

export interface StreamTokenResponse {
  token: string;
  expiresAt: number;
  streamUrl: string;
}

export interface LibraryResponse {
  books: Book[];
  total: number;
}

export interface BookDetailResponse {
  book: Book;
  chapters: Chapter[];
  progress?: Progress | null;
}

export interface SyncProgressRequest {
  bookId: string;
  currentTimeSeconds: number;
  durationSeconds: number;
  lastChapterId?: string;
  isFinished?: boolean;
  sequenceNumber: number;
}

export interface SyncProgressResponse {
  success: boolean;
  resolvedPositionSeconds: number;
  sequenceNumber: number;
}

/**
 * Hybrid Logical Clock (HLC) representing a causally ordered timestamp
 * across multiple offline/online devices.
 */
export interface HybridLogicalClock {
  timeMs: number;
  counter: number;
  nodeId: string;
}

/**
 * Normalized representation of a book's playback progress
 * stored in SQLite inside the user's SyncRoom Durable Object.
 */
export interface BookProgressRecord {
  bookId: string;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isPlaying: boolean;
  hlc: HybridLogicalClock;
  deviceId: string;
  deviceName?: string;
  updatedAt: number;
}

/**
 * Real-time WebSocket messages sent from client to server.
 */
export type SyncClientMessage =
  | {
      type: "SYNC_UPDATE";
      bookId: string;
      currentTime: number;
      duration: number;
      playbackRate: number;
      isPlaying: boolean;
      hlc: HybridLogicalClock;
      deviceId: string;
      deviceName?: string;
      isExplicitSeek?: boolean;
    }
  | {
      type: "REQUEST_STATE";
      bookId?: string;
    }
  | {
      type: "PING";
    };

/**
 * Real-time WebSocket messages sent from server to client.
 */
export type SyncServerMessage =
  | {
      type: "SYNC_ACK";
      bookId: string;
      currentTime: number;
      hlc: HybridLogicalClock;
    }
  | {
      type: "PROGRESS_BROADCAST";
      bookId: string;
      currentTime: number;
      duration: number;
      playbackRate: number;
      isPlaying: boolean;
      hlc: HybridLogicalClock;
      deviceId: string;
      deviceName?: string;
      updatedAt: number;
    }
  | {
      type: "INITIAL_STATE";
      books: BookProgressRecord[];
    }
  | {
      type: "PONG";
    };
