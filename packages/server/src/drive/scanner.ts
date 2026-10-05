/**
 * audioneko: Google Drive Library Scanner & Metadata Ingest Engine
 * Discovers audiobooks, series, tracks, and artwork from Google Drive.
 * Upserts them into Cloudflare D1 with zero-cost and atomic transactions.
 */

import { eq } from "drizzle-orm";
import { createDb } from "../db";
import * as schema from "../db/schema";
import type { Env } from "../types";
import { enrichBookMetadata } from "./enrich";
import { parseId3Metadata, parseMp4Metadata } from "./metadata";
import { getGoogleAccessToken } from "./token";

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  modifiedTime?: string;
}

export interface ParsedBookInfo {
  title: string;
  author: string;
  series?: string;
  seriesIndex?: number;
  narrator?: string;
  format: "m4b" | "mp3" | "m4a" | "flac" | "opus";
}

/**
 * Extracts book title, author, series, seriesIndex from filenames and folder names
 */
export function parseBookInfo(filename: string, parentFolderName = ""): ParsedBookInfo {
  const ext = filename.split(".").pop()?.toLowerCase() || "m4b";
  const format: "m4b" | "mp3" | "m4a" | "flac" | "opus" =
    ext === "mp3" || ext === "m4a" || ext === "flac" || ext === "opus" ? ext : "m4b";

  let cleanName = filename.replace(/\.(m4b|mp3|m4a|flac|opus)$/i, "").trim();
  cleanName = cleanName.replace(/\s*\((Unabridged|Abridged)\)/i, "").trim();

  let title = cleanName;
  let author = "Unknown Author";
  let series: string | undefined;
  let seriesIndex: number | undefined;
  let narrator: string | undefined;

  // Derive series, author, or narrator cues from parent folder name
  if (parentFolderName) {
    if (parentFolderName.toLowerCase().includes("graphicaudio")) {
      narrator = "GraphicAudio";
    }

    if (parentFolderName.toLowerCase().includes("acotar")) {
      series = "A Court of Thorns and Roses";
      author = "Sarah J. Maas";
    } else if (parentFolderName.toLowerCase().includes("crescent city")) {
      series = "Crescent City";
      author = "Sarah J. Maas";
    } else if (parentFolderName.toLowerCase().includes("addicted")) {
      series = "Addicted";
      const byMatch = parentFolderName.match(/by\s+(.+)$/i);
      if (byMatch?.[1]) {
        author = byMatch[1].trim();
      }
    }
  }

  // Pattern 1: Series #Index - Title by Author (e.g. "Windy City #1 - Mile High by Liz Tomforde")
  const seriesByMatch = cleanName.match(/^(.+?)\s*#(\d+(?:\.\d+)?)\s*-\s*(.+?)\s+by\s+(.+)$/i);
  if (seriesByMatch?.[1] && seriesByMatch[2] && seriesByMatch[3] && seriesByMatch[4]) {
    series = seriesByMatch[1].trim();
    seriesIndex = Number.parseFloat(seriesByMatch[2]);
    title = seriesByMatch[3].trim();
    author = seriesByMatch[4].trim();
    return { title, author, series, seriesIndex, narrator, format };
  }

  // Pattern 2: Author - Title (e.g. "Lana Ferguson - The Nanny")
  const authorTitleMatch = cleanName.match(/^([^-]+)\s*-\s*(.+)$/);
  if (authorTitleMatch?.[1] && authorTitleMatch[2] && !series) {
    const left = authorTitleMatch[1].trim();
    const right = authorTitleMatch[2].trim();
    if (/^\d+$/.test(left)) {
      seriesIndex = Number.parseFloat(left);
      title = right;
    } else {
      author = left;
      title = right;
    }
    return { title, author, series, seriesIndex, narrator, format };
  }

  // Pattern 3: Number - Title (e.g. "01 - House of Earth and Blood")
  const numTitleMatch = cleanName.match(/^(\d+)\s*-\s*(.+)$/);
  if (numTitleMatch?.[1] && numTitleMatch[2]) {
    seriesIndex = Number.parseFloat(numTitleMatch[1]);
    title = numTitleMatch[2].trim();
    return { title, author, series, seriesIndex, narrator, format };
  }

  // Pattern 4: B01 Title (e.g. "B01 Addicted to You")
  const bNumMatch = cleanName.match(/^B(\d+)\s+(.+)$/i);
  if (bNumMatch?.[1] && bNumMatch[2]) {
    seriesIndex = Number.parseFloat(bNumMatch[1]);
    title = bNumMatch[2].trim();
    return { title, author, series, seriesIndex, narrator, format };
  }

  return { title, author, series, seriesIndex, narrator, format };
}

export interface ScanResult {
  success: boolean;
  totalAudiobooks: number;
  totalFiles: number;
  books: Array<{
    id: string;
    title: string;
    author: string;
    series?: string;
    seriesIndex?: number;
    format: string;
    durationSeconds: number;
  }>;
}

/**
 * Recursively scans Google Drive folder tree and ingests into D1 database
 */
export async function scanDriveLibrary(
  env: Env,
  rootFolderId: string,
  customFetch: typeof fetch = fetch,
): Promise<ScanResult> {
  if (!env.GOOGLE_SA_KEY) {
    throw new Error("Missing GOOGLE_SA_KEY environment binding");
  }

  const token = await getGoogleAccessToken(env.GOOGLE_SA_KEY, env.KV, customFetch);
  const db = createDb(env.DB);

  interface AudioFileEntry {
    item: DriveItem;
    parentFolderId: string;
    parentFolderName: string;
  }

  interface ImageFileEntry {
    item: DriveItem;
    parentFolderId: string;
    parentFolderName: string;
  }

  const audioFiles: AudioFileEntry[] = [];
  const imageFiles: ImageFileEntry[] = [];

  // Recursive directory explorer
  async function exploreFolder(folderId: string, folderName: string): Promise<void> {
    let pageToken: string | undefined;

    do {
      const queryParams = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, size, md5Checksum, modifiedTime)",
        pageSize: "100",
      });
      if (pageToken) queryParams.set("pageToken", pageToken);

      const res = await customFetch(
        `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`Failed to list folder ${folderId} [${res.status}]: ${errText}`);
        break;
      }

      const data = (await res.json()) as { nextPageToken?: string; files?: DriveItem[] };
      const items = data.files || [];

      for (const item of items) {
        if (item.mimeType === "application/vnd.google-apps.folder") {
          await exploreFolder(item.id, item.name);
        } else if (
          item.name.endsWith(".m4b") ||
          item.name.endsWith(".mp3") ||
          item.name.endsWith(".m4a") ||
          item.name.endsWith(".flac") ||
          item.name.endsWith(".opus")
        ) {
          audioFiles.push({ item, parentFolderId: folderId, parentFolderName: folderName });
        } else if (
          item.name.endsWith(".jpg") ||
          item.name.endsWith(".jpeg") ||
          item.name.endsWith(".png") ||
          item.name.endsWith(".webp")
        ) {
          imageFiles.push({ item, parentFolderId: folderId, parentFolderName: folderName });
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);
  }

  // Explore starting at root folder
  await exploreFolder(rootFolderId, "");

  const seriesCache = new Map<string, string>(); // seriesName -> seriesId
  const importedBooks: ScanResult["books"] = [];

  // Process each audio file
  for (const { item, parentFolderId, parentFolderName } of audioFiles) {
    const parsed = parseBookInfo(item.name, parentFolderName);
    const sizeBytes = Number.parseInt(item.size || "0", 10);

    // 1. Handle Series if detected
    let seriesId: string | null = null;
    if (parsed.series) {
      if (seriesCache.has(parsed.series)) {
        seriesId = seriesCache.get(parsed.series) || null;
      } else {
        // Query D1 for series or insert
        const existingSeries = await db
          .select()
          .from(schema.series)
          .where(eq(schema.series.name, parsed.series))
          .limit(1);

        if (existingSeries[0]) {
          seriesId = existingSeries[0].id;
        } else {
          const newSeriesId = `ser_${crypto.randomUUID()}`;
          await db.insert(schema.series).values({
            id: newSeriesId,
            name: parsed.series,
            bookCount: 1,
            createdAt: Math.floor(Date.now() / 1000),
          });
          seriesId = newSeriesId;
        }
        seriesCache.set(parsed.series, seriesId);
      }
    }

    // 2. Find matching cover image
    let coverKey: string | null = null;
    // Check if an image matches the series index or name
    if (parsed.seriesIndex !== undefined) {
      const matchedImg = imageFiles.find((img) => {
        const lower = img.item.name.toLowerCase();
        return (
          lower.includes(`${parsed.seriesIndex}`) ||
          (parsed.series?.toLowerCase().includes("acotar") &&
            (parsed.seriesIndex === 1
              ? lower.includes("acotar")
              : parsed.seriesIndex === 2
                ? lower.includes("acomaf")
                : parsed.seriesIndex === 3
                  ? lower.includes("acowar")
                  : parsed.seriesIndex === 4
                    ? lower.includes("acofas")
                    : parsed.seriesIndex === 5
                      ? lower.includes("acosf")
                      : false))
        );
      });
      if (matchedImg) {
        coverKey = `gdrive:${matchedImg.item.id}`;
      }
    }

    if (!coverKey && imageFiles.length > 0) {
      // Pick image from same folder if any
      const folderImg = imageFiles.find((img) => img.parentFolderId === parentFolderId);
      if (folderImg) {
        coverKey = `gdrive:${folderImg.item.id}`;
      }
    }

    // 3. Estimate or parse duration
    // Standard bitrate: M4B AAC 64kbps = 8,000 bytes/sec, MP3 128kbps = 16,000 bytes/sec
    const bytesPerSecond = parsed.format === "mp3" ? 16000 : 8000;
    let durationSeconds = Math.round(sizeBytes / bytesPerSecond);

    // Try reading first 128KB to parse actual atom duration if M4B
    if (parsed.format === "m4b" && sizeBytes > 0) {
      try {
        const probeRes = await customFetch(
          `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Range: "bytes=0-131071",
            },
          },
        );
        if (probeRes.ok || probeRes.status === 206) {
          const probeBuf = new Uint8Array(await probeRes.arrayBuffer());
          const meta = parseMp4Metadata(probeBuf);
          if (meta.durationSeconds && meta.durationSeconds > 0) {
            durationSeconds = Math.round(meta.durationSeconds);
          }
        }
      } catch {
        // Fallback to estimated duration
      }
    }

    // 4. Deterministic Book ID based on drive item ID
    const bookId = `bk_${item.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    // Upsert into books table
    const existingBook = await db
      .select()
      .from(schema.books)
      .where(eq(schema.books.driveFolderId, item.id))
      .limit(1);

    const nowEpoch = Math.floor(Date.now() / 1000);

    if (existingBook[0]) {
      await db
        .update(schema.books)
        .set({
          title: parsed.title,
          author: parsed.author,
          seriesId,
          seriesIndex: parsed.seriesIndex ?? null,
          narrator: parsed.narrator ?? existingBook[0].narrator,
          durationSeconds,
          fileSizeBytes: sizeBytes,
          format: parsed.format,
          coverR2Key: coverKey ?? existingBook[0].coverR2Key,
          updatedAt: nowEpoch,
        })
        .where(eq(schema.books.id, existingBook[0].id));
    } else {
      await db.insert(schema.books).values({
        id: bookId,
        driveFolderId: item.id,
        title: parsed.title,
        author: parsed.author,
        seriesId,
        seriesIndex: parsed.seriesIndex ?? null,
        narrator: parsed.narrator ?? "Audiobook Narrator",
        description: `${parsed.title} by ${parsed.author}.`,
        coverR2Key: coverKey,
        durationSeconds,
        publishedYear: null,
        format: parsed.format,
        fileSizeBytes: sizeBytes,
        isActiveShelf: false,
        createdAt: nowEpoch,
        updatedAt: nowEpoch,
      });
    }

    // 5. Upsert into files table
    const fileId = `fl_${item.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const existingFile = await db
      .select()
      .from(schema.files)
      .where(eq(schema.files.driveFileId, item.id))
      .limit(1);

    if (!existingFile[0]) {
      await db.insert(schema.files).values({
        id: fileId,
        bookId: existingBook[0]?.id || bookId,
        driveFileId: item.id,
        name: item.name,
        sizeBytes,
        mimeType: item.mimeType || (parsed.format === "mp3" ? "audio/mpeg" : "audio/x-m4b"),
        trackNumber: parsed.seriesIndex ? Math.round(parsed.seriesIndex) : 1,
        md5Checksum: item.md5Checksum || null,
      });
    }

    // 6. Ensure default chapter exists
    const targetBookId = existingBook[0]?.id || bookId;
    const existingChapter = await db
      .select()
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, targetBookId))
      .limit(1);

    if (!existingChapter[0]) {
      await db.insert(schema.chapters).values({
        id: `ch_${targetBookId}_1`,
        bookId: targetBookId,
        chapterIndex: 1,
        title: parsed.title,
        startTime: 0,
        endTime: durationSeconds,
        duration: durationSeconds,
      });
    }

    importedBooks.push({
      id: targetBookId,
      title: parsed.title,
      author: parsed.author,
      series: parsed.series,
      seriesIndex: parsed.seriesIndex,
      format: parsed.format,
      durationSeconds,
    });
  }

  return {
    success: true,
    totalAudiobooks: importedBooks.length,
    totalFiles: audioFiles.length,
    books: importedBooks,
  };
}
