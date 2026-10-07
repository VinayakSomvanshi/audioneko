import type { Book, BookProgressRecord } from "@audioneko/shared";

/**
 * audioneko: StoryGraph & Goodreads CSV Sync Engine
 *
 * Supports bidirectional reading data interchange:
 * 1. Export finished & in-progress audiobooks in standard Goodreads & StoryGraph CSV formats.
 * 2. Import CSV from Goodreads or StoryGraph, fuzzy-matching titles and authors against Google Drive library.
 */

export interface ParsedCsvRecord {
  title: string;
  author: string;
  readStatus: "read" | "currently-reading" | "to-read";
  rating?: number; // 1-5
  dateAdded?: string;
  dateRead?: string;
  source: "goodreads" | "storygraph" | "generic";
  originalRow: Record<string, string>;
}

export interface CsvLibraryMatchResult {
  matched: Array<{
    book: Book;
    record: ParsedCsvRecord;
  }>;
  unmatchedRecords: ParsedCsvRecord[];
}

/**
 * Escapes values according to RFC 4180 CSV specifications.
 */
function escapeCsv(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats a Date object or timestamp into YYYY/MM/DD
 */
function formatDate(d: Date | number | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "number" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/**
 * Exports current library and listening progress into official Goodreads CSV format.
 */
export function exportGoodreadsCsv(
  books: Book[],
  progressMap: Record<string, BookProgressRecord>,
): string {
  const headers = [
    "Book Id",
    "Title",
    "Author",
    "Author l-f",
    "Additional Authors",
    "ISBN",
    "ISBN13",
    "My Rating",
    "Average Rating",
    "Publisher",
    "Binding",
    "Number of Pages",
    "Year Published",
    "Original Publication Year",
    "Date Read",
    "Date Added",
    "Bookshelves",
    "Bookshelves with positions",
    "Exclusive Shelf",
    "My Review",
    "Spoiler",
    "Private Notes",
    "Read Count",
    "Owned Copies",
  ];

  const rows: string[] = [headers.join(",")];

  for (const book of books) {
    const progress = progressMap[book.id];
    const isFinished = progress?.isFinished || false;
    const isStarted = progress && progress.currentTime > 60;

    let exclusiveShelf = "to-read";
    if (isFinished) {
      exclusiveShelf = "read";
    } else if (isStarted) {
      exclusiveShelf = "currently-reading";
    }

    const dateAdded = formatDate(book.createdAt ? new Date(book.createdAt) : new Date());
    const dateRead =
      isFinished && progress?.updatedAt ? formatDate(new Date(progress.updatedAt)) : "";

    const row = [
      escapeCsv(book.id),
      escapeCsv(book.title),
      escapeCsv(book.author || "Unknown Author"),
      "", // Author l-f
      "", // Additional Authors
      "", // ISBN
      "", // ISBN13
      escapeCsv(isFinished ? 5 : 0), // Default rating
      "", // Average Rating
      "", // Publisher
      escapeCsv("Audiobook"), // Binding
      "", // Number of Pages
      "", // Year Published
      "", // Original Publication Year
      escapeCsv(dateRead),
      escapeCsv(dateAdded),
      escapeCsv(book.series ? book.series.name : ""), // Bookshelves
      "", // Bookshelves with positions
      escapeCsv(exclusiveShelf),
      "", // My Review
      "", // Spoiler
      "", // Private Notes
      escapeCsv(isFinished ? 1 : 0),
      "1", // Owned Copies
    ];

    rows.push(row.join(","));
  }

  return rows.join("\n");
}

/**
 * Exports current library into StoryGraph CSV format.
 */
export function exportStoryGraphCsv(
  books: Book[],
  progressMap: Record<string, BookProgressRecord>,
): string {
  const headers = [
    "Title",
    "Authors",
    "ISBN/UID",
    "Format",
    "Read Status",
    "Date Added",
    "Last Date Read",
    "Star Rating",
    "Review",
    "Tags",
  ];

  const rows: string[] = [headers.join(",")];

  for (const book of books) {
    const progress = progressMap[book.id];
    const isFinished = progress?.isFinished || false;
    const isStarted = progress && progress.currentTime > 60;

    let readStatus = "to-read";
    if (isFinished) {
      readStatus = "read";
    } else if (isStarted) {
      readStatus = "currently-reading";
    }

    const dateAdded = formatDate(book.createdAt ? new Date(book.createdAt) : new Date());
    const lastDateRead =
      isFinished && progress?.updatedAt ? formatDate(new Date(progress.updatedAt)) : "";

    const row = [
      escapeCsv(book.title),
      escapeCsv(book.author || "Unknown Author"),
      escapeCsv(book.id),
      escapeCsv("Audiobook"),
      escapeCsv(readStatus),
      escapeCsv(dateAdded),
      escapeCsv(lastDateRead),
      escapeCsv(isFinished ? 5 : ""),
      "",
      escapeCsv(book.series ? `Series: ${book.series.name}` : ""),
    ];

    rows.push(row.join(","));
  }

  return rows.join("\n");
}

/**
 * Robust CSV line parser supporting quoted fields and embedded commas.
 */
function parseCsvRows(text: string): string[][] {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (char === "\n" || (char === "\r" && nextChar === "\n")) {
        if (char === "\r") i++;
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else if (char === "\r") {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      lines.push(currentRow);
    }
  }

  return lines;
}

/**
 * Parses either a Goodreads or StoryGraph CSV export into unified ParsedCsvRecord array.
 */
export function parseReadingCsv(csvContent: string): ParsedCsvRecord[] {
  const rows = parseCsvRows(csvContent);
  if (rows.length < 2) return [];

  const rawHeaders = rows[0].map((h) => h.toLowerCase().trim());
  const headerMap: Record<string, number> = {};
  rawHeaders.forEach((h, idx) => {
    headerMap[h] = idx;
  });

  const isGoodreads = "exclusive shelf" in headerMap || "book id" in headerMap;
  const isStoryGraph = "read status" in headerMap || "authors" in headerMap;
  const source = isGoodreads ? "goodreads" : isStoryGraph ? "storygraph" : "generic";

  const results: ParsedCsvRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;

    const rowObj: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      rowObj[h] = row[idx] || "";
    });

    let title = "";
    let author = "";
    let readStatus: "read" | "currently-reading" | "to-read" = "to-read";
    let rating: number | undefined;

    if (isGoodreads) {
      title = rowObj.title || "";
      author = rowObj.author || rowObj["author l-f"] || "";
      const shelf = (rowObj["exclusive shelf"] || "").toLowerCase();
      if (shelf === "read") readStatus = "read";
      else if (shelf === "currently-reading") readStatus = "currently-reading";
      else readStatus = "to-read";

      const r = Number.parseFloat(rowObj["my rating"] || "0");
      if (r > 0) rating = r;
    } else if (isStoryGraph) {
      title = rowObj.title || "";
      author = rowObj.authors || rowObj.author || "";
      const status = (rowObj["read status"] || "").toLowerCase();
      if (status.includes("read") && !status.includes("currently") && !status.includes("to")) {
        readStatus = "read";
      } else if (status.includes("currently")) {
        readStatus = "currently-reading";
      } else {
        readStatus = "to-read";
      }

      const r = Number.parseFloat(rowObj["star rating"] || "0");
      if (r > 0) rating = r;
    } else {
      // Generic fallback
      title = rowObj.title || rowObj.book || row[0] || "";
      author = rowObj.author || rowObj.authors || row[1] || "";
      const status = (rowObj.status || "").toLowerCase();
      if (status.includes("read")) readStatus = "read";
      else if (status.includes("current")) readStatus = "currently-reading";
    }

    if (title) {
      results.push({
        title,
        author,
        readStatus,
        rating,
        dateAdded: rowObj["date added"] || undefined,
        dateRead: rowObj["date read"] || rowObj["last date read"] || undefined,
        source,
        originalRow: rowObj,
      });
    }
  }

  return results;
}

/**
 * Normalizes title strings for fuzzy matching.
 */
function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches parsed CSV records against books in the audioneko Google Drive library.
 */
export function matchCsvWithLibrary(
  records: ParsedCsvRecord[],
  books: Book[],
): CsvLibraryMatchResult {
  const matched: Array<{ book: Book; record: ParsedCsvRecord }> = [];
  const unmatchedRecords: ParsedCsvRecord[] = [];

  const booksNormalized = books.map((b) => ({
    book: b,
    normTitle: normalizeString(b.title),
    normAuthor: normalizeString(b.author || ""),
  }));

  for (const record of records) {
    const recNormTitle = normalizeString(record.title);
    const recNormAuthor = normalizeString(record.author);

    // Exact title & author match
    let match = booksNormalized.find((b) => {
      const titleMatches =
        b.normTitle === recNormTitle ||
        b.normTitle.includes(recNormTitle) ||
        recNormTitle.includes(b.normTitle);
      if (!titleMatches) return false;
      if (!recNormAuthor || !b.normAuthor) return true;
      return b.normAuthor.includes(recNormAuthor) || recNormAuthor.includes(b.normAuthor);
    });

    // Fallback: title-only exact match
    if (!match) {
      match = booksNormalized.find((b) => b.normTitle === recNormTitle);
    }

    if (match) {
      matched.push({ book: match.book, record });
    } else {
      unmatchedRecords.push(record);
    }
  }

  return {
    matched,
    unmatchedRecords,
  };
}
