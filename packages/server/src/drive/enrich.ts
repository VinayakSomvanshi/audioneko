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
  key?: string;
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

interface ITunesAudiobookResult {
  collectionName?: string;
  artistName?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  description?: string;
}

interface ITunesResponse {
  resultCount?: number;
  results?: ITunesAudiobookResult[];
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
function normalizeAuthor(authorStr: string): string {
  const trimmed = authorStr.trim();
  if (!trimmed || trimmed === "Unknown Author") return "Unknown Author";
  const inverted = trimmed.match(/^([^,]+),\s*([^,]+)$/);
  if (inverted?.[1] && inverted[2] && !/^(inc|llc|ltd|co|corp)$/i.test(inverted[2])) {
    return `${inverted[2].trim()} ${inverted[1].trim()}`;
  }
  return trimmed;
}

export async function enrichBookMetadata(
  title: string,
  author?: string,
  customFetch: typeof fetch = fetch,
): Promise<EnrichedBookMetadata> {
  const normalizedAuthor = author && author !== "Unknown Author" ? normalizeAuthor(author) : "";
  const result: EnrichedBookMetadata = {
    title,
    author: normalizedAuthor || "Unknown Author",
    genres: [],
  };

  const cleanTitle =
    title
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .trim() || title.trim();
  const hasKnownAuthor = Boolean(normalizedAuthor);
  // Extract primary author if multiple joined by & or and
  const primaryAuthor = hasKnownAuthor
    ? normalizedAuthor.split(/\s*(?:&|and)\s*/i)[0]?.trim() || ""
    : "";

  // 1. Query Apple Books / iTunes Audiobook API for authentic 1:1 square artwork & metadata
  try {
    const itunesTerm = [cleanTitle, primaryAuthor].filter(Boolean).join(" ");
    const itunesParams = new URLSearchParams({
      media: "audiobook",
      term: itunesTerm,
      limit: "5",
    });
    const itunesRes = await customFetch(
      `https://itunes.apple.com/search?${itunesParams.toString()}`,
      {
        headers: {
          "User-Agent": "audioneko-audiobooks/1.0 (https://github.com/VinayakSomvanshi/audioneko)",
          Accept: "application/json",
        },
      },
    );

    let itunesData: ITunesResponse = {};
    if (itunesRes.ok) {
      itunesData = (await itunesRes.json()) as ITunesResponse;
    } else {
      console.warn(`[enrich] itunes search returned ${itunesRes.status} for "${itunesTerm}"`);
    }

    let results = itunesData.results || [];

    // Fallback: if no results with author included, query with just the title
    if (results.length === 0 && primaryAuthor) {
      const fallbackParams = new URLSearchParams({
        media: "audiobook",
        term: cleanTitle,
        limit: "5",
      });
      const fallbackRes = await customFetch(
        `https://itunes.apple.com/search?${fallbackParams.toString()}`,
        {
          headers: {
            "User-Agent":
              "audioneko-audiobooks/1.0 (https://github.com/VinayakSomvanshi/audioneko)",
            Accept: "application/json",
          },
        },
      );
      if (fallbackRes.ok) {
        const fallbackData = (await fallbackRes.json()) as ITunesResponse;
        results = fallbackData.results || [];
      }
    }

    const lowerTitle = cleanTitle.toLowerCase();
    const matched =
      results.find((r) => r.collectionName?.toLowerCase().startsWith(lowerTitle)) ||
      results.find((r) => r.collectionName?.toLowerCase().includes(lowerTitle)) ||
      results[0];

    if (matched) {
      if (matched.artworkUrl100) {
        // Upgrade to high-resolution 600x600 square artwork
        result.coverUrl = matched.artworkUrl100.replace(
          /100x100bb\.(jpg|png|webp)/i,
          "600x600bb.$1",
        );
      }
      if (matched.description) {
        result.description = matched.description
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      if ((!result.author || result.author === "Unknown Author") && matched.artistName) {
        result.author = matched.artistName;
      }
      if (matched.releaseDate) {
        const year = Number.parseInt(matched.releaseDate.slice(0, 4), 10);
        if (!Number.isNaN(year)) {
          result.publishedYear = year;
        }
      }
      if (matched.primaryGenreName) {
        result.genres = [matched.primaryGenreName];
      }
    }
  } catch (itunesErr) {
    console.warn(`[enrich] itunes search error for "${cleanTitle}":`, itunesErr);
  }

  // 2. Query Open Library if cover or author is still missing
  if (!result.coverUrl || result.author === "Unknown Author") {
    // Helper: Open Library Title/Author query
    async function queryOpenLibrary(titleQ: string, authorQ?: string): Promise<OpenLibraryDoc[]> {
      try {
        const olQuery = new URLSearchParams({
          title: titleQ,
          limit: "5",
        });
        if (authorQ) {
          olQuery.set("author", authorQ);
        }

        const res = await customFetch(`https://openlibrary.org/search.json?${olQuery.toString()}`, {
          headers: {
            "User-Agent":
              "audioneko-audiobooks/1.0 (https://github.com/VinayakSomvanshi/audioneko)",
          },
        });

        if (res.ok) {
          const data = (await res.json()) as OpenLibraryResponse;
          return data.docs || [];
        }
      } catch {
        // Non-blocking
      }
      return [];
    }

    let docs = await queryOpenLibrary(cleanTitle, primaryAuthor || undefined);

    // Fallback 1: If no results with cover or author, and title starts with "The", "A", or "An" (e.g. "The Nanny" -> "Nanny")
    const articleRegex = /^(the|a|an)\s+/i;
    if (!docs.some((d) => d.cover_i || d.author_name) && articleRegex.test(cleanTitle)) {
      const strippedTitle = cleanTitle.replace(articleRegex, "").trim();
      const fallbackDocs = await queryOpenLibrary(strippedTitle, primaryAuthor || undefined);
      if (fallbackDocs.length > 0) {
        docs = fallbackDocs;
      }
    }

    // Fallback 2: If author was provided but yielded 0 results, try title only
    if (!docs.some((d) => d.cover_i || d.author_name) && primaryAuthor) {
      const titleOnlyDocs = await queryOpenLibrary(cleanTitle);
      if (titleOnlyDocs.length > 0) {
        docs = titleOnlyDocs;
      }
    }

    // Fallback 3: General query with q
    if (!docs.some((d) => d.cover_i || d.author_name)) {
      try {
        const q = [cleanTitle, primaryAuthor].filter(Boolean).join(" ");
        const qParams = new URLSearchParams({ q, limit: "5" });
        const qRes = await customFetch(
          `https://openlibrary.org/search.json?${qParams.toString()}`,
          {
            headers: { "User-Agent": "audioneko-audiobooks/1.0" },
          },
        );
        if (qRes.ok) {
          const qData = (await qRes.json()) as OpenLibraryResponse;
          if (qData.docs && qData.docs.length > 0) {
            docs = qData.docs;
          }
        }
      } catch {
        // Non-blocking
      }
    }

    // Select the best doc: prefer exact title match with cover/author, or first with cover
    let matchedDoc: OpenLibraryDoc | undefined;
    if (docs.length > 0) {
      matchedDoc =
        docs.find(
          (d) =>
            (d.cover_i || d.author_name) && d.title?.toLowerCase() === cleanTitle.toLowerCase(),
        ) ||
        docs.find((d) => d.cover_i && d.author_name) ||
        docs.find((d) => d.cover_i || d.author_name) ||
        docs[0];
    }

    if (matchedDoc) {
      if (!result.publishedYear && matchedDoc.first_publish_year) {
        result.publishedYear = matchedDoc.first_publish_year;
      }
      if (!result.coverUrl && matchedDoc.cover_i) {
        result.coverUrl = `https://covers.openlibrary.org/b/id/${matchedDoc.cover_i}-L.jpg`;
      }
      if (!result.isbn && matchedDoc.isbn?.[0]) {
        result.isbn = matchedDoc.isbn[0];
      }
      if (result.genres.length === 0 && matchedDoc.subject && Array.isArray(matchedDoc.subject)) {
        result.genres = matchedDoc.subject.slice(0, 5);
      }
      if ((!result.author || result.author === "Unknown Author") && matchedDoc.author_name?.[0]) {
        result.author = matchedDoc.author_name[0];
      }
    }
  }

  // 2. Query Google Books API for backup synopsis and cover
  if (!result.description || !result.coverUrl) {
    try {
      let gbQuery = `intitle:"${cleanTitle}"`;
      if (primaryAuthor) {
        gbQuery += ` inauthor:"${primaryAuthor}"`;
      }

      const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(gbQuery)}&maxResults=1`;
      const gbRes = await customFetch(gbUrl);

      if (gbRes.ok) {
        const gbData = (await gbRes.json()) as GoogleBooksResponse;
        const volume = gbData.items?.[0]?.volumeInfo;

        if (volume) {
          if (!result.description && volume.description) {
            result.description = volume.description;
          }
          if (!result.coverUrl && volume.imageLinks) {
            const highRes =
              volume.imageLinks.extraLarge ||
              volume.imageLinks.large ||
              volume.imageLinks.thumbnail ||
              volume.imageLinks.smallThumbnail;
            if (highRes) {
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
