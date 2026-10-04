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
