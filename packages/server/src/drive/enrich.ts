/**
 * audioneko: External Metadata Enrichment Engine
 * The "TMDB of Books": Integrates Open Library & Google Books APIs
 * Zero-cost, free-tier, open endpoints for covers, synopses, and series data.
 */

export interface EnrichedBookMetadata {
  title: string;
  author: string;
  description?: string | null;
  coverUrl?: string | null;
  publishedYear?: number | null;
  series?: string | null;
  seriesIndex?: number | null;
  isbn?: string | null;
  genres: string[];
}

interface OpenLibraryDoc {
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  subject?: string[];
}

interface OpenLibraryResponse {
  numFound?: number;
  docs?: OpenLibraryDoc[];
}

interface GoogleBooksItem {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    publishedDate?: string;
    categories?: string[];
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
      large?: string;
      extraLarge?: string;
    };
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
  };
}

interface GoogleBooksResponse {
  totalItems?: number;
  items?: GoogleBooksItem[];
}

/**
 * Enriches book metadata by querying Open Library and Google Books
 */
export async function enrichBookMetadata(
  title: string,
  author?: string,
  customFetch: typeof fetch = fetch,
): Promise<EnrichedBookMetadata> {
  const result: EnrichedBookMetadata = {
    title,
    author: author || "Unknown Author",
    genres: [],
  };

  const cleanTitle = title.trim();
  const cleanAuthor = author?.trim() || "";

  // 1. Query Open Library API (Zero-auth, 100% open)
  try {
    const olQuery = new URLSearchParams({
      title: cleanTitle,
      limit: "1",
    });
    if (cleanAuthor) {
      olQuery.set("author", cleanAuthor);
    }

    const olRes = await customFetch(`https://openlibrary.org/search.json?${olQuery.toString()}`, {
      headers: {
        "User-Agent": "audioneko-audiobooks/1.0 (https://github.com/VinayakSomvanshi/audioneko)",
      },
    });

    if (olRes.ok) {
      const olData = (await olRes.json()) as OpenLibraryResponse;
      const firstDoc = olData.docs?.[0];

      if (firstDoc) {
        if (firstDoc.first_publish_year) {
          result.publishedYear = firstDoc.first_publish_year;
        }
        if (firstDoc.cover_i) {
          result.coverUrl = `https://covers.openlibrary.org/b/id/${firstDoc.cover_i}-L.jpg`;
        }
        if (firstDoc.isbn?.[0]) {
          result.isbn = firstDoc.isbn[0];
        }
        if (firstDoc.subject && Array.isArray(firstDoc.subject)) {
          result.genres = firstDoc.subject.slice(0, 5);
        }
        if (!result.author && firstDoc.author_name?.[0]) {
          result.author = firstDoc.author_name[0];
        }
      }
    }
  } catch {
    // Non-blocking: Proceed to Google Books fallback
  }

  // 2. Query Google Books API for rich plot synopsis and backup cover
  try {
    let gbQuery = `intitle:"${cleanTitle}"`;
    if (cleanAuthor) {
      gbQuery += ` inauthor:"${cleanAuthor}"`;
    }

    const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(gbQuery)}&maxResults=1`;
    const gbRes = await customFetch(gbUrl);

    if (gbRes.ok) {
      const gbData = (await gbRes.json()) as GoogleBooksResponse;
      const volume = gbData.items?.[0]?.volumeInfo;

      if (volume) {
        if (volume.description) {
          result.description = volume.description;
        }
        if (!result.coverUrl && volume.imageLinks) {
          const highRes =
            volume.imageLinks.extraLarge ||
            volume.imageLinks.large ||
            volume.imageLinks.thumbnail ||
            volume.imageLinks.smallThumbnail;
          if (highRes) {
            // Force HTTPS for mixed-content prevention
            result.coverUrl = highRes.replace(/^http:\/\//i, "https://");
          }
        }
        if (!result.publishedYear && volume.publishedDate) {
          const year = Number.parseInt(volume.publishedDate.slice(0, 4), 10);
          if (!Number.isNaN(year)) {
            result.publishedYear = year;
          }
        }
        if (result.genres.length === 0 && volume.categories) {
          result.genres = volume.categories;
        }
      }
    }
  } catch {
    // Non-blocking
  }

  // 3. Heuristic: Parse series tags from title (e.g. "Dune: Book 1 - The Desert Planet")
  const seriesMatch = cleanTitle.match(/(?:Book|Vol(?:ume)?\.?)\s*(\d+(?:\.\d+)?)/i);
  if (seriesMatch?.[1]) {
    const volNum = Number.parseFloat(seriesMatch[1]);
    if (!Number.isNaN(volNum)) {
      result.seriesIndex = volNum;
    }
  }

  return result;
}
