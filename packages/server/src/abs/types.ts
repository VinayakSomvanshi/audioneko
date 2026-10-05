/**
 * audioneko: Audiobookshelf (ABS) API Compatibility Types
 * Conforms to Audiobookshelf API specification for Plappa, ShelfPlayer, and native ABS clients.
 */

export interface AbsUserPermissions {
  download: boolean;
  update: boolean;
  delete: boolean;
  upload: boolean;
  accessAllLibraries: boolean;
  accessAllTags: boolean;
}

export interface AbsUser {
  id: string;
  username: string;
  email: string;
  type: "root" | "admin" | "user";
  token: string;
  isActive: boolean;
  isLocked: boolean;
  lastSeen: number;
  createdAt: number;
  permissions: AbsUserPermissions;
  librariesAccessible: string[];
}

export interface AbsServerSettings {
  id: string;
  scannerFindCovers: boolean;
  rateLimitRequests: number;
}

export interface AbsLoginResponse {
  user: AbsUser;
  userDefaultLibraryId: string;
  serverSettings: AbsServerSettings;
  Source: string;
}

export interface AbsLibraryFolder {
  id: string;
  fullPath: string;
  libraryId: string;
}

export interface AbsLibrary {
  id: string;
  name: string;
  mediaType: "book";
  folders: AbsLibraryFolder[];
  displayOrder: number;
  icon: string;
  mediaCount?: number;
}

export interface AbsSeriesItem {
  id: string;
  name: string;
  sequence: string;
}

export interface AbsMetadata {
  title: string;
  titleIgnorePrefix: string;
  subtitle: string | null;
  authorName: string;
  authorNameLF: string;
  narratorName: string | null;
  seriesName: string | null;
  series: AbsSeriesItem[];
  genres: string[];
  publishedYear: string | null;
  publishedDate?: string | null;
  publisher?: string | null;
  description: string | null;
  isbn?: string | null;
  asin?: string | null;
  language: string;
  explicit: boolean;
  abridged: boolean;
}

export interface AbsAudioFileMetadata {
  filename: string;
  ext: string;
  path?: string;
  size: number;
  format: string;
}

export interface AbsAudioFile {
  index: number;
  ino: string;
  metadata: AbsAudioFileMetadata;
  duration: number;
  mimeType: string;
}

export interface AbsChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface AbsTrack {
  index: number;
  startOffset: number;
  duration: number;
  title: string;
  contentUrl: string;
  mimeType: string;
}

export interface AbsMedia {
  id: string;
  libraryItemId: string;
  metadata: AbsMetadata;
  coverPath: string;
  tags: string[];
  numTracks: number;
  numAudioFiles: number;
  numChapters: number;
  numMissingParts: number;
  numInvalidAudioFiles: number;
  duration: number;
  size: number;
  audioFiles: AbsAudioFile[];
  chapters: AbsChapter[];
  tracks: AbsTrack[];
}

export interface AbsMediaProgress {
  id: string;
  libraryItemId: string;
  episodeId: string | null;
  duration: number;
  progress: number;
  currentTime: number;
  isFinished: boolean;
  hideFromContinueListening: boolean;
  lastUpdate: number;
  startedAt: number;
}

export interface AbsLibraryItem {
  id: string;
  ino: string;
  libraryId: string;
  folderId: string;
  path: string;
  relPath: string;
  isFile: boolean;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  addedAt: number;
  updatedAt: number;
  isMissing: boolean;
  isInvalid: boolean;
  mediaType: "book";
  media: AbsMedia;
  numFiles: number;
  size: number;
  userMediaProgress?: AbsMediaProgress;
}

export interface AbsItemsResponse {
  results: AbsLibraryItem[];
  total: number;
  limit: number;
  page: number;
  sortBy: string;
  sortDesc: boolean;
  filterBy: string;
}

export interface AbsPersonalizedShelf {
  id: string;
  label: string;
  type: "continue-listening" | "books" | "series";
  entities: AbsLibraryItem[];
}
