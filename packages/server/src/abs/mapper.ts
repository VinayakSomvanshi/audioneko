/**
 * audioneko: Audiobookshelf Data Mapper
 * Translates audioneko database entities into standard Audiobookshelf API shapes.
 */

import type {
  AbsAudioFile,
  AbsChapter,
  AbsLibraryItem,
  AbsMedia,
  AbsMediaProgress,
  AbsMetadata,
  AbsSeriesItem,
  AbsTrack,
} from "./types";

export function mapProgressToAbs(
  progressRow: {
    id: string;
    bookId: string;
    currentTimeSeconds: number;
    durationSeconds: number;
    progressFraction: number;
    isFinished: boolean | number;
    updatedAt: number;
  },
  bookDuration = 0,
): AbsMediaProgress {
  return {
    id: progressRow.id,
    libraryItemId: progressRow.bookId,
    episodeId: null,
    duration: progressRow.durationSeconds || bookDuration,
    progress: progressRow.progressFraction || 0,
    currentTime: progressRow.currentTimeSeconds || 0,
    isFinished: Boolean(progressRow.isFinished),
    hideFromContinueListening: Boolean(progressRow.isFinished),
    lastUpdate: (progressRow.updatedAt || Math.floor(Date.now() / 1000)) * 1000,
    startedAt: (progressRow.updatedAt || Math.floor(Date.now() / 1000)) * 1000,
  };
}

export interface BookEntityInput {
  id: string;
  title: string;
  author: string;
  narrator?: string | null;
  description?: string | null;
  durationSeconds?: number;
  fileSizeBytes?: number;
  format?: string;
  publishedYear?: number | null;
  coverR2Key?: string | null;
  seriesId?: string | null;
  seriesIndex?: number | null;
  createdAt?: number;
  updatedAt?: number;
  series?: { id: string; name: string } | null;
  chapters?: Array<{
    chapterIndex: number;
    title: string;
    startTime: number;
    endTime: number;
    duration: number;
  }>;
  files?: Array<{
    id: string;
    driveFileId: string;
    name: string;
    sizeBytes: number;
    mimeType: string;
    trackNumber?: number | null;
  }>;
}

export function mapBookToAbsItem(
  book: BookEntityInput,
  progressRow?: {
    id: string;
    bookId: string;
    currentTimeSeconds: number;
    durationSeconds: number;
    progressFraction: number;
    isFinished: boolean | number;
    updatedAt: number;
  } | null,
): AbsLibraryItem {
  const fileList = book.files || [];
  const chapterList = (book.chapters || []).slice().sort((a, b) => a.chapterIndex - b.chapterIndex);

  const audioFiles: AbsAudioFile[] = fileList.map((file, idx) => ({
    index: file.trackNumber || idx + 1,
    ino: file.id,
    metadata: {
      filename: file.name,
      ext: `.${book.format || "m4b"}`,
      size: file.sizeBytes,
      format: book.format || "m4b",
    },
    duration: book.durationSeconds || 0,
    mimeType: file.mimeType || "audio/mp4",
  }));

  const chapters: AbsChapter[] = chapterList.map((chap) => ({
    id: chap.chapterIndex,
    start: chap.startTime,
    end: chap.endTime,
    title: chap.title,
  }));

  const tracks: AbsTrack[] = fileList.map((file, idx) => ({
    index: file.trackNumber || idx + 1,
    startOffset: 0,
    duration: book.durationSeconds || 0,
    title: file.name || book.title,
    contentUrl: `/api/stream/${file.driveFileId}`,
    mimeType: file.mimeType || "audio/mp4",
  }));

  const seriesList: AbsSeriesItem[] = book.series
    ? [
        {
          id: book.series.id,
          name: book.series.name,
          sequence: book.seriesIndex != null ? String(book.seriesIndex) : "1",
        },
      ]
    : [];

  const metadata: AbsMetadata = {
    title: book.title,
    titleIgnorePrefix: book.title,
    subtitle: null,
    authorName: book.author,
    authorNameLF: book.author,
    narratorName: book.narrator ?? null,
    seriesName: book.series?.name ?? null,
    series: seriesList,
    genres: [],
    publishedYear: book.publishedYear ? String(book.publishedYear) : null,
    publishedDate: null,
    publisher: null,
    description: book.description ?? null,
    isbn: null,
    asin: null,
    language: "en",
    explicit: false,
    abridged: false,
  };

  const media: AbsMedia = {
    id: book.id,
    libraryItemId: book.id,
    metadata,
    coverPath: `/api/items/${book.id}/cover`,
    tags: [],
    numTracks: tracks.length || 1,
    numAudioFiles: audioFiles.length || 1,
    numChapters: chapters.length,
    numMissingParts: 0,
    numInvalidAudioFiles: 0,
    duration: book.durationSeconds || 0,
    size: book.fileSizeBytes || 0,
    audioFiles,
    chapters,
    tracks,
  };

  const userProgress = progressRow
    ? mapProgressToAbs(progressRow, book.durationSeconds)
    : undefined;
  const createdAtMs = (book.createdAt || Math.floor(Date.now() / 1000)) * 1000;
  const updatedAtMs = (book.updatedAt || Math.floor(Date.now() / 1000)) * 1000;

  return {
    id: book.id,
    ino: book.id,
    libraryId: "default-audiobooks",
    folderId: "drive-vault",
    path: `/books/${book.id}`,
    relPath: book.id,
    isFile: false,
    mtimeMs: updatedAtMs,
    ctimeMs: createdAtMs,
    birthtimeMs: createdAtMs,
    addedAt: createdAtMs,
    updatedAt: updatedAtMs,
    isMissing: false,
    isInvalid: false,
    mediaType: "book",
    media,
    numFiles: fileList.length + 1,
    size: book.fileSizeBytes || 0,
    userMediaProgress: userProgress,
  };
}
