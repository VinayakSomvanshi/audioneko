import { relations, sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ==========================================
// 1. Better Auth Core & Passkey Tables
// ==========================================

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["admin", "listener"] })
    .notNull()
    .default("listener"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const passkey = sqliteTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull().unique(),
  counter: integer("counter").notNull().default(0),
  deviceType: text("device_type").notNull(),
  backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
  transports: text("transports"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// ==========================================
// 2. Cryptographic Invite Tokens
// ==========================================

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  role: text("role", { enum: ["admin", "listener"] })
    .notNull()
    .default("listener"),
  expiresAt: integer("expires_at").notNull(),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

// ==========================================
// 3. Library & Media Schema
// ==========================================

export const series = sqliteTable("series", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  bookCount: integer("book_count").notNull().default(0),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export const books = sqliteTable(
  "books",
  {
    id: text("id").primaryKey(),
    driveFolderId: text("drive_folder_id").notNull().unique(),
    title: text("title").notNull(),
    author: text("author").notNull(),
    seriesId: text("series_id").references(() => series.id, { onDelete: "set null" }),
    seriesIndex: real("series_index"),
    narrator: text("narrator"),
    description: text("description"),
    coverR2Key: text("cover_r2_key"),
    durationSeconds: real("duration_seconds").notNull().default(0),
    publishedYear: integer("published_year"),
    format: text("format", { enum: ["m4b", "mp3", "m4a", "flac", "opus"] })
      .notNull()
      .default("m4b"),
    fileSizeBytes: integer("file_size_bytes").notNull().default(0),
    isActiveShelf: integer("is_active_shelf", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index("books_author_idx").on(table.author),
    index("books_series_idx").on(table.seriesId),
    index("books_active_shelf_idx").on(table.isActiveShelf),
  ],
);

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    chapterIndex: integer("chapter_index").notNull(),
    title: text("title").notNull(),
    startTime: real("start_time").notNull(),
    endTime: real("end_time").notNull(),
    duration: real("duration").notNull(),
  },
  (table) => [
    index("chapters_book_idx").on(table.bookId),
    index("chapters_order_idx").on(table.bookId, table.chapterIndex),
  ],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    driveFileId: text("drive_file_id").notNull().unique(),
    name: text("name").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    mimeType: text("mime_type").notNull(),
    trackNumber: integer("track_number"),
    md5Checksum: text("md5_checksum"),
  },
  (table) => [
    index("files_book_idx").on(table.bookId),
    uniqueIndex("files_drive_idx").on(table.driveFileId),
  ],
);

// ==========================================
// 4. Progress, Sync & Listening Analytics
// ==========================================

export const progress = sqliteTable(
  "progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    currentTimeSeconds: real("current_time_seconds").notNull().default(0),
    durationSeconds: real("duration_seconds").notNull().default(0),
    progressFraction: real("progress_fraction").notNull().default(0),
    lastChapterId: text("last_chapter_id").references(() => chapters.id, { onDelete: "set null" }),
    isFinished: integer("is_finished", { mode: "boolean" }).notNull().default(false),
    sequenceNumber: integer("sequence_number").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("progress_user_book_idx").on(table.userId, table.bookId),
    index("progress_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const listeningEvents = sqliteTable(
  "listening_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    startTimeSeconds: real("start_time_seconds").notNull(),
    endTimeSeconds: real("end_time_seconds").notNull(),
    durationListenedSeconds: real("duration_listened_seconds").notNull(),
    playbackRate: real("playback_rate").notNull().default(1.0),
    timestamp: integer("timestamp").notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index("listening_events_user_ts_idx").on(table.userId, table.timestamp),
    index("listening_events_book_idx").on(table.bookId),
  ],
);

// ==========================================
// 5. Bookmarks, Clips & Shelves
// ==========================================

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    positionSeconds: real("position_seconds").notNull(),
    chapterTitle: text("chapter_title"),
    note: text("note"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [index("bookmarks_user_book_idx").on(table.userId, table.bookId)],
);

export const clips = sqliteTable(
  "clips",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    startTime: real("start_time").notNull(),
    endTime: real("end_time").notNull(),
    note: text("note"),
    audioR2Key: text("audio_r2_key"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [index("clips_user_book_idx").on(table.userId, table.bookId)],
);

export const shelves = sqliteTable("shelves", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export const shelfItems = sqliteTable(
  "shelf_items",
  {
    id: text("id").primaryKey(),
    shelfId: text("shelf_id")
      .notNull()
      .references(() => shelves.id, { onDelete: "cascade" }),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    addedAt: integer("added_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [uniqueIndex("shelf_items_shelf_book_idx").on(table.shelfId, table.bookId)],
);

// ==========================================
// 6. Drizzle Relations Definitions
// ==========================================

export const booksRelations = relations(books, ({ one, many }) => ({
  series: one(series, {
    fields: [books.seriesId],
    references: [series.id],
  }),
  chapters: many(chapters),
  files: many(files),
  progress: many(progress),
  bookmarks: many(bookmarks),
  clips: many(clips),
}));

export const chaptersRelations = relations(chapters, ({ one }) => ({
  book: one(books, {
    fields: [chapters.bookId],
    references: [books.id],
  }),
}));

export const seriesRelations = relations(series, ({ many }) => ({
  books: many(books),
}));

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  passkeys: many(passkey),
  progress: many(progress),
  bookmarks: many(bookmarks),
  clips: many(clips),
  shelves: many(shelves),
  listeningEvents: many(listeningEvents),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));
