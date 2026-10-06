/**
 * audioneko: Dynamic Author Metadata Ingest Engine
 * Discovers author portraits, biographies, birth dates, and catalog statistics
 * from Open Library and cached in Cloudflare KV edge cache.
 */

import type { AuthorProfile } from "@audioneko/shared";
import type { Env } from "../types";

export type EnrichedAuthorMetadata = AuthorProfile;

const CURATED_AUTHOR_PHOTOS: Record<string, string> = {
  "meghan quinn": "https://images.gr-assets.com/authors/1778858370p8/7360513.jpg",
  "krista ritchie":
    "https://static.wixstatic.com/media/bf6fdf_9e881b463379418d95688c942acfbf95~mv2.jpg/v1/fill/w_488,h_524,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Krista%20and%20Becca%20-%20Author%20Photo%202%20-%20Square.jpg",
  "krista ritchie & becca ritchie":
    "https://static.wixstatic.com/media/bf6fdf_9e881b463379418d95688c942acfbf95~mv2.jpg/v1/fill/w_488,h_524,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Krista%20and%20Becca%20-%20Author%20Photo%202%20-%20Square.jpg",
  "lana ferguson": "https://freshfiction.com/images/authors/48886.jpeg",
  "rosie danan":
    "https://images.squarespace-cdn.com/content/v1/5cdc348cebfc7f30af34bbe6/2d91a297-2d29-4f0b-afef-036cf45e6a71/Rosie_+Danan_portraits_21.jpg",
};

/**
 * Normalizes inverted "LastName, FirstName" to "FirstName LastName"
 */
export function normalizeAuthorName(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed || trimmed === "Unknown Author") return "Unknown Author";

  const inverted = trimmed.match(/^([^,]+),\s*([^,]+)$/);
  if (inverted?.[1] && inverted[2] && !/^(inc|llc|ltd|co|corp)$/i.test(inverted[2])) {
    return `${inverted[2].trim()} ${inverted[1].trim()}`;
  }
  return trimmed;
}

interface OpenLibraryAuthorDoc {
  key?: string;
  name?: string;
  birth_date?: string;
  top_work?: string;
  work_count?: number;
}

interface OpenLibraryAuthorSearchResponse {
  numFound?: number;
  docs?: OpenLibraryAuthorDoc[];
}

interface OpenLibraryAuthorDetailResponse {
  key?: string;
  name?: string;
  bio?: string | { type?: string; value?: string };
  birth_date?: string;
  photos?: number[];
  remote_ids?: {
    goodreads?: string;
    wikidata?: string;
    viaf?: string;
  };
}

/**
 * Executes a fetch with an abort timeout to guarantee responsiveness.
 */
async function fetchWithTimeout(
  url: string,
  customFetch: typeof fetch,
  timeoutMs = 3500,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await customFetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "audioneko-audiobook-server/1.0 (author-enrichment)",
        Accept: "application/json",
      },
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dynamically queries Open Library and KV to enrich author profiles.
 */
export async function enrichAuthorMetadata(
  rawAuthorName: string,
  env?: { KV?: Env["KV"] },
  customFetch: typeof fetch = fetch,
): Promise<EnrichedAuthorMetadata> {
  const authorName = normalizeAuthorName(rawAuthorName);
  if (!authorName || authorName === "Unknown Author") {
    return {
      name: "Unknown Author",
      photoUrl: null,
      bio: null,
      birthDate: null,
      topWork: null,
      openLibraryKey: null,
    };
  }

  const normalizedKey = authorName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const kvKey = `author_meta:${normalizedKey}`;

  // 1. Check KV Cache
  if (env?.KV) {
    try {
      const cached = (await env.KV.get(kvKey, "json")) as EnrichedAuthorMetadata | null;
      if (cached) {
        return cached;
      }
    } catch {
      // Ignore KV read error and proceed to dynamic fetch
    }
  }

  // 2. Prepare default metadata
  const metadata: EnrichedAuthorMetadata = {
    name: authorName,
    photoUrl: null,
    bio: null,
    birthDate: null,
    topWork: null,
    openLibraryKey: null,
  };

  // Check curated photo override
  const lowerName = authorName.toLowerCase();
  for (const [key, photo] of Object.entries(CURATED_AUTHOR_PHOTOS)) {
    if (lowerName === key || lowerName.includes(key)) {
      metadata.photoUrl = photo;
      break;
    }
  }

  // 3. Query Open Library Author Search
  const searchName =
    (authorName.includes("&")
      ? authorName.split("&")[0]?.trim()
      : authorName.includes(" and ")
        ? authorName.split(" and ")[0]?.trim()
        : authorName) || authorName;

  try {
    const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(searchName)}`;
    const searchRes = await fetchWithTimeout(searchUrl, customFetch);

    if (searchRes?.ok) {
      const searchData = (await searchRes.json()) as OpenLibraryAuthorSearchResponse;
      const doc = searchData.docs?.[0];

      if (doc?.key) {
        const cleanKey = doc.key.replace("/authors/", "");
        metadata.openLibraryKey = cleanKey;
        metadata.birthDate = doc.birth_date || null;
        metadata.topWork = doc.top_work || null;
        metadata.workCount = doc.work_count ?? null;

        // 4. Query Open Library Author Details for Bio & Photos
        const detailUrl = `https://openlibrary.org/authors/${cleanKey}.json`;
        const detailRes = await fetchWithTimeout(detailUrl, customFetch);

        if (detailRes?.ok) {
          const detailData = (await detailRes.json()) as OpenLibraryAuthorDetailResponse;

          // Bio
          if (typeof detailData.bio === "string") {
            metadata.bio = detailData.bio.trim();
          } else if (detailData.bio && typeof detailData.bio === "object" && detailData.bio.value) {
            metadata.bio = detailData.bio.value.trim();
          }

          // Photo (if not already set by curated override)
          if (!metadata.photoUrl) {
            if (
              Array.isArray(detailData.photos) &&
              detailData.photos.length > 0 &&
              typeof detailData.photos[0] === "number" &&
              detailData.photos[0] > 0
            ) {
              metadata.photoUrl = `https://covers.openlibrary.org/a/id/${detailData.photos[0]}-L.jpg`;
            } else {
              metadata.photoUrl = `https://covers.openlibrary.org/a/olid/${cleanKey}-M.jpg`;
            }
          }

          // Remote IDs
          if (detailData.remote_ids?.goodreads) {
            metadata.goodreadsId = detailData.remote_ids.goodreads;
          }
          if (detailData.remote_ids?.wikidata) {
            metadata.wikidataId = detailData.remote_ids.wikidata;
          }
        } else if (!metadata.photoUrl) {
          // Fallback to olid photo
          metadata.photoUrl = `https://covers.openlibrary.org/a/olid/${cleanKey}-M.jpg`;
        }
      }
    }
  } catch {
    // Graceful fallback to default/curated metadata
  }

  // 5. Cache in KV for 30 days (or 7 days if unresolved)
  if (env?.KV) {
    try {
      const ttl =
        metadata.openLibraryKey || metadata.photoUrl ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7;
      await env.KV.put(kvKey, JSON.stringify(metadata), { expirationTtl: ttl });
    } catch {
      // Ignore KV write failure
    }
  }

  return metadata;
}
