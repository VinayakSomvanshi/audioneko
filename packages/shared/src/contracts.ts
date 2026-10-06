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

// ==========================================
// Listening Analytics & Streak Types
// ==========================================

export interface DailyListeningData {
  date: string; // "YYYY-MM-DD"
  secondsListened: number;
  eventsCount: number;
  intensity: 0 | 1 | 2 | 3 | 4; // 0=0s, 1=<15m, 2=15-45m, 3=45m-2h, 4=>2h
}

export interface ListeningAnalyticsResponse {
  currentStreakDays: number;
  longestStreakDays: number;
  totalListenedSeconds: number;
  totalBooksCompleted: number;
  todayListenedSeconds: number;
  averageDailySeconds: number;
  dailyHistory: DailyListeningData[]; // Recent 365 days
}

export interface RecordListeningEventRequest {
  bookId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationListenedSeconds: number;
  playbackRate: number;
  timestamp?: number;
}

// ==========================================
// Social Presence Types
// ==========================================

export interface FriendPresence {
  userId: string;
  userName: string;
  userImage?: string | null;
  isOnline: boolean;
  lastActiveAt: number;
  currentBook?: {
    bookId: string;
    title: string;
    author: string;
    coverR2Key?: string | null;
    progressFraction: number;
    currentTimeSeconds: number;
    durationSeconds: number;
    isPlaying: boolean;
  } | null;
}

export interface SocialPresenceResponse {
  friends: FriendPresence[];
}

// ==========================================
// Listen-Along Synchronous Room Types
// ==========================================

export interface ListenAlongRoomState {
  roomId: string;
  hostUserId: string;
  hostName: string;
  bookId: string;
  bookTitle?: string;
  positionSeconds: number;
  isPlaying: boolean;
  playbackRate: number;
  epochSnapshotTime: number; // Server timestamp in ms when state was broadcast
  listenersCount: number;
}

export type ListenAlongClientMessage =
  | {
      type: "HOST_UPDATE";
      bookId: string;
      positionSeconds: number;
      isPlaying: boolean;
      playbackRate: number;
    }
  | {
      type: "JOIN_ROOM";
      roomId: string;
    }
  | {
      type: "LEAVE_ROOM";
    };

export type ListenAlongServerMessage =
  | {
      type: "ROOM_STATE";
      state: ListenAlongRoomState;
    }
  | {
      type: "HOST_STATE_BROADCAST";
      bookId: string;
      positionSeconds: number;
      isPlaying: boolean;
      playbackRate: number;
      epochSnapshotTime: number;
    }
  | {
      type: "LISTENER_COUNT";
      count: number;
    };

export interface AuthorProfile {
  name: string;
  photoUrl: string | null;
  bio: string | null;
  birthDate: string | null;
  topWork: string | null;
  workCount?: number | null;
  openLibraryKey: string | null;
  goodreadsId?: string | null;
  wikidataId?: string | null;
}

export interface AuthorItem {
  name: string;
  bookCount: number;
  seriesCount: number;
  seriesNames: string[];
  totalDurationSeconds: number;
  books: Book[];
  photoUrl?: string | null;
  bio?: string | null;
  birthDate?: string | null;
  topWork?: string | null;
  openLibraryKey?: string | null;
}
