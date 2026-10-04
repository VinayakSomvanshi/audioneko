export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "listener";
  avatarUrl?: string;
  createdAt: number;
}

export interface Book {
  id: string;
  driveFolderId: string;
  title: string;
  author: string;
  seriesId?: string | null;
  seriesIndex?: number | null;
  narrator?: string | null;
  description?: string | null;
  coverR2Key?: string | null;
  durationSeconds: number;
  publishedYear?: number | null;
  format: "m4b" | "mp3" | "m4a" | "flac" | "opus";
  fileSizeBytes: number;
  isActiveShelf: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  chapterIndex: number;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface AudioFile {
  id: string;
  bookId: string;
  driveFileId: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  trackNumber?: number | null;
  md5Checksum?: string | null;
}

export interface Series {
  id: string;
  name: string;
  description?: string | null;
  bookCount: number;
}

export interface Progress {
  id: string;
  userId: string;
  bookId: string;
  currentTimeSeconds: number;
  durationSeconds: number;
  progressFraction: number;
  lastChapterId?: string | null;
  isFinished: boolean;
  sequenceNumber: number;
  updatedAt: number;
}

export interface ListeningEvent {
  id: string;
  userId: string;
  bookId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationListenedSeconds: number;
  playbackRate: number;
  timestamp: number;
}

export interface Bookmark {
  id: string;
  userId: string;
  bookId: string;
  positionSeconds: number;
  chapterTitle?: string | null;
  note?: string | null;
  createdAt: number;
}

export interface Clip {
  id: string;
  userId: string;
  bookId: string;
  startTime: number;
  endTime: number;
  note?: string | null;
  audioR2Key?: string | null;
  createdAt: number;
}

export interface Shelf {
  id: string;
  userId: string;
  name: string;
  isPublic: boolean;
  createdAt: number;
}

export interface ShelfItem {
  id: string;
  shelfId: string;
  bookId: string;
  orderIndex: number;
  addedAt: number;
}

export interface SyncMessage {
  type: "PROGRESS_UPDATE" | "DEVICE_PROGRESS" | "SYNC_ACK" | "PLAYBACK_STATE";
  bookId: string;
  offset: number;
  sequenceNumber: number;
  hlcTimestamp: number;
  isPlaying?: boolean;
  playbackRate?: number;
  deviceId?: string;
}
