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
  async function exploreFolder(
    folderId: string,
    folderName: string,
    parentOfFolderId?: string,
  ): Promise<void> {
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
          await exploreFolder(item.id, item.name, folderId);
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
          const isArtworkSubfolder = /^(artwork|covers?|images?)$/i.test(folderName);
          const effectiveParentFolderId =
            isArtworkSubfolder && parentOfFolderId ? parentOfFolderId : folderId;
          imageFiles.push({
            item,
            parentFolderId: effectiveParentFolderId,
            parentFolderName: folderName,
          });
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);
  }

  // Explore starting at root folder
  await exploreFolder(rootFolderId, "");

  const seriesCache = new Map<string, string>(); // seriesName -> seriesId
  const importedBooks: ScanResult["books"] = [];
  // Per-folder tracking: prevent assigning the same image to multiple books in the same folder
  const usedCoverIdsByFolder = new Map<string, Set<string>>();

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

    // 2. Find cover image — strictly folder-local to avoid cross-series contamination
    let coverKey: string | null = null;

    // Only consider images from the EXACT same parent folder as this audio file
    const folderImages = imageFiles.filter((img) => img.parentFolderId === parentFolderId);

    if (folderImages.length > 0) {
      // Get or create the per-folder used-set
      if (!usedCoverIdsByFolder.has(parentFolderId)) {
        usedCoverIdsByFolder.set(parentFolderId, new Set());
      }
      const usedInFolder = usedCoverIdsByFolder.get(parentFolderId)!;

      // Score: how well does an image filename match this book?
      const scoreCoverMatch = (imgName: string): number => {
        // Strip extension for matching
        const lower = imgName.toLowerCase().replace(/\.[^.]+$/, "");
        let score = 0;

        // SeriesIndex: word-boundary match so "1" doesn't match inside "10" or "21"
        if (parsed.seriesIndex !== undefined) {
          const idxStr = String(Math.round(parsed.seriesIndex));
          if (new RegExp(`(?<![0-9])${idxStr}(?![0-9])`).test(lower)) score += 3;
        }

        // Title words (length > 3 to skip noise words)
        for (const word of parsed.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3)) {
          if (lower.includes(word)) score += 2;
        }

        // Series name words
        if (parsed.series) {
          for (const word of parsed.series.toLowerCase().split(/\s+/).filter((w) => w.length > 3)) {
            if (lower.includes(word)) score += 2;
          }
        }

        // Author name parts
        for (const part of parsed.author.toLowerCase().split(/\s+/).filter((w) => w.length > 3)) {
          if (lower.includes(part)) score += 1;
        }

        // ACOTAR shorthand codes (series-specific high-confidence matches)
        if (
          parsed.series?.toLowerCase().includes("acotar") ||
          parsed.series?.toLowerCase().includes("court of thorns") ||
          parsed.title?.toLowerCase().includes("court of")
        ) {
          const acoMap: Record<number, string> = {
            1: "acotar",
            2: "acomaf",
            3: "acowar",
            4: "acofas",
            5: "acosf",
          };
          const sh = parsed.seriesIndex !== undefined ? acoMap[Math.round(parsed.seriesIndex)] : undefined;
          if (sh && lower.includes(sh)) score += 5;
        }

        return score;
      };

      // Score and sort all folder images
      const scored = folderImages
        .map((img) => ({ img, score: scoreCoverMatch(img.item.name) }))
        .sort((a, b) => b.score - a.score);

      // Pick best scoring unused image; fall back to any unused if no scored match
      const best = scored.find((s) => s.score > 0 && !usedInFolder.has(s.img.item.id));
      const fallback = folderImages.find((img) => !usedInFolder.has(img.item.id));
      const chosen = best?.img ?? fallback ?? null;

      if (chosen) {
        coverKey = `gdrive:${chosen.item.id}`;
        // Mark as claimed — only for images with a clear 1:1 match (score >= 3)
        // Shared series covers (score < 3) can be reused across books in same folder
        if (best && best.score >= 3) {
          usedInFolder.add(chosen.item.id);
        }
      }
    }
    // If folderImages is empty → coverKey stays null (no cover for this book)

    // 3. Look up existing book from D1 to avoid redundant network subrequests
    const bookId = `bk_${item.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const existingBook = await db
      .select()
      .from(schema.books)
      .where(eq(schema.books.driveFolderId, item.id))
      .limit(1);

    // Standard bitrate: M4B AAC 64kbps = 8,000 bytes/sec, MP3 128kbps = 16,000 bytes/sec
    const bytesPerSecond = parsed.format === "mp3" ? 16000 : 8000;
    const durationSeconds =
      existingBook[0]?.durationSeconds && existingBook[0].durationSeconds > 0
        ? existingBook[0].durationSeconds
        : Math.round(sizeBytes / bytesPerSecond);

    // 4. Enrich metadata via Open Library + Google Books (free, zero-auth)
    // Re-use already enriched metadata from D1 if available to stay well within Cloudflare Worker subrequest limits
    const prevBook = existingBook[0];
    let enrichedAuthor =
      prevBook?.author && prevBook.author !== "Unknown Author" ? prevBook.author : parsed.author;
    let enrichedDescription = prevBook?.description ?? `${parsed.title} by ${enrichedAuthor}.`;
    let enrichedPublishedYear: number | null = prevBook?.publishedYear ?? null;
    let enrichedCoverUrl: string | null =
      prevBook?.coverR2Key?.startsWith("http") ? prevBook.coverR2Key : null;

    // Only query external API if:
    // a) Author is still unknown, OR
    // b) We don't have a verified square cover (mzstatic or Drive folder image)
    const hasSquareCover =
      Boolean(coverKey?.startsWith("gdrive:")) ||
      Boolean(prevBook?.coverR2Key && prevBook.coverR2Key.includes("mzstatic.com"));

    const needsEnrichment =
      !coverKey && (enrichedAuthor === "Unknown Author" || !hasSquareCover);

    if (needsEnrichment) {
      try {
        const enriched = await enrichBookMetadata(
          parsed.title,
          enrichedAuthor !== "Unknown Author" ? enrichedAuthor : undefined,
          customFetch,
        );

        if (enrichedAuthor === "Unknown Author" && enriched.author && enriched.author !== "Unknown Author") {
          enrichedAuthor = enriched.author;
        }
        if (enriched.description) {
          enrichedDescription = enriched.description;
        }
        if (enriched.publishedYear) {
          enrichedPublishedYear = enriched.publishedYear;
        }
        if (!coverKey && enriched.coverUrl) {
          enrichedCoverUrl = enriched.coverUrl;
        }
      } catch (enrichErr) {
        console.warn(`[scan] enrichment error for "${parsed.title}":`, enrichErr);
      }
    }

    // Final cover: Drive gdrive: key takes priority, then API URL, then null
    const finalCoverKey = coverKey ?? enrichedCoverUrl;
    const nowEpoch = Math.floor(Date.now() / 1000);

    if (existingBook[0]) {
      await db
        .update(schema.books)
        .set({
          title: parsed.title,
          author: enrichedAuthor,
          seriesId,
          seriesIndex: parsed.seriesIndex ?? null,
          narrator: parsed.narrator ?? existingBook[0].narrator,
          description: enrichedDescription,
          publishedYear: enrichedPublishedYear ?? existingBook[0].publishedYear,
          durationSeconds,
          fileSizeBytes: sizeBytes,
          format: parsed.format,
          // Always overwrite coverR2Key — null clears stale bad covers from previous scans
          coverR2Key: finalCoverKey,
          updatedAt: nowEpoch,
        })
        .where(eq(schema.books.id, existingBook[0].id));
    } else {
      await db.insert(schema.books).values({
        id: bookId,
        driveFolderId: item.id,
        title: parsed.title,
        author: enrichedAuthor,
        seriesId,
        seriesIndex: parsed.seriesIndex ?? null,
        narrator: parsed.narrator ?? "Audiobook Narrator",
        description: enrichedDescription,
        coverR2Key: finalCoverKey,
        durationSeconds,
        publishedYear: enrichedPublishedYear,
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
      author: enrichedAuthor,
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
