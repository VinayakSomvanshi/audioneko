/**
 * audioneko: Dynamic Author Metadata Ingest Engine
 * Discovers author portraits, biographies, birth dates, and catalog statistics
 * from Open Library and cached in Cloudflare KV edge cache.
 */

import type { AuthorProfile } from "@audioneko/shared";
import type { Env } from "../types";

export type EnrichedAuthorMetadata = AuthorProfile;

const CURATED_AUTHOR_PHOTOS: Record<string, string> = {
  "meghan quinn":
    "https://authormeghanquinn.com/cdn/shop/files/mq_1200x628_9d5d22dd-2ba3-4ea6-8993-24d829ff4ed3.png",
  "krista ritchie":
    "https://static.wixstatic.com/media/bf6fdf_9e881b463379418d95688c942acfbf95~mv2.jpg/v1/fill/w_488,h_524,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Krista%20and%20Becca%20-%20Author%20Photo%202%20-%20Square.jpg",
  "becca ritchie":
    "https://static.wixstatic.com/media/bf6fdf_9e881b463379418d95688c942acfbf95~mv2.jpg/v1/fill/w_488,h_524,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Krista%20and%20Becca%20-%20Author%20Photo%202%20-%20Square.jpg",
  "krista ritchie & becca ritchie":
    "https://static.wixstatic.com/media/bf6fdf_9e881b463379418d95688c942acfbf95~mv2.jpg/v1/fill/w_488,h_524,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Krista%20and%20Becca%20-%20Author%20Photo%202%20-%20Square.jpg",
  "lana ferguson": "https://freshfiction.com/images/authors/48886.jpeg",
  "rosie danan":
    "https://images.squarespace-cdn.com/content/v1/5cdc348cebfc7f30af34bbe6/2d91a297-2d29-4f0b-afef-036cf45e6a71/Rosie_+Danan_portraits_21.jpg",
  "pierce brown":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Pierce_Brown_by_Gage_Skidmore.jpg/500px-Pierce_Brown_by_Gage_Skidmore.jpg",
  "sarah j. maas":
    "https://sarahjmaas.com/wp-content/uploads/2025/03/240117_Today_SarahJMaas_216_resized.jpg",
  "sarah j maas":
    "https://sarahjmaas.com/wp-content/uploads/2025/03/240117_Today_SarahJMaas_216_resized.jpg",
  "rebecca yarros":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/NBF2024-rebecca-yarros.jpg/500px-NBF2024-rebecca-yarros.jpg",
  "ali hazelwood":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Ali_Hazelwood_2025_Texas_Book_Festival.jpg/500px-Ali_Hazelwood_2025_Texas_Book_Festival.jpg",
  "elsie silver":
    "https://images.squarespace-cdn.com/content/v1/6904ff34eb46bd478b74d219/a96d7cb6-21f6-444f-ad98-0934e52c5b4b/194A1682.jpg",
  "liz tomforde": "https://static.showit.co/1200/LeiNY5tERxiHZOKslq26Xw/214378/img_1283.jpg",
};

const CURATED_AUTHOR_BIOS: Record<string, { bio: string; birthDate: string; topWork: string }> = {
  "pierce brown": {
    bio: "Pierce Brown (born January 28, 1988) is an American science fiction author best known for his acclaimed Red Rising saga, consisting of Red Rising (2014), Golden Son (2015), Morning Star (2016), Iron Gold (2018), Dark Age (2019), and Light Bringer (2023).",
    birthDate: "28 January 1988",
    topWork: "Red Rising",
  },
  "sarah j. maas": {
    bio: "Sarah J. Maas (born March 5, 1986) is a #1 New York Times and internationally bestselling author of the Crescent City, A Court of Thorns and Roses, and Throne of Glass series. Her books have sold over 40 million copies worldwide in thirty-eight languages.",
    birthDate: "5 March 1986",
    topWork: "Throne of Glass",
  },
  "sarah j maas": {
    bio: "Sarah J. Maas (born March 5, 1986) is a #1 New York Times and internationally bestselling author of the Crescent City, A Court of Thorns and Roses, and Throne of Glass series. Her books have sold over 40 million copies worldwide in thirty-eight languages.",
    birthDate: "5 March 1986",
    topWork: "Throne of Glass",
  },
  "rebecca yarros": {
    bio: "Rebecca Yarros (born April 14, 1981) is a #1 New York Times, USA Today, and Wall Street Journal bestselling author of more than fifteen novels, including Fourth Wing, Iron Flame, and Onyx Storm in the blockbuster fantasy series The Empyrean.",
    birthDate: "14 April 1981",
    topWork: "Fourth Wing",
  },
  "ali hazelwood": {
    bio: "Ali Hazelwood (born December 11, 1989) is an Italian romance novelist, neuroscience professor, and New York Times bestselling author celebrated for romantic comedies centered on women in STEM, including The Love Hypothesis, Love on the Brain, and Love, Theoretically.",
    birthDate: "11 December 1989",
    topWork: "The Love Hypothesis",
  },
  "elsie silver": {
    bio: "Elsie Silver is a Canadian contemporary romance author internationally recognized for creating small-town romance series full of heart and heat, including the Chestnut Springs saga and the Emerald Lake series beginning with Fever Dream.",
    birthDate: "1988",
    topWork: "Fever Dream",
  },
  "liz tomforde": {
    bio: "Liz Tomforde writes sports romance and contemporary love stories with unforgettable banter and high emotion. A former flight attendant, she is the bestselling author behind the beloved Windy City series featuring Mile High, The Right Move, Caught Up, Play Along, Rewind It Back, and In Her Own League.",
    birthDate: "1994",
    topWork: "Mile High",
  },
  "krista ritchie": {
    bio: "Krista & Becca Ritchie are New York Times and USA Today bestselling twin sister authors who write New Adult contemporary romance and drama, most famously known for the Addicted and Calloway Sisters series.",
    birthDate: "1989",
    topWork: "Addicted to You",
  },
  "krista ritchie & becca ritchie": {
    bio: "Krista & Becca Ritchie are New York Times and USA Today bestselling twin sister authors who write New Adult contemporary romance and drama, most famously known for the Addicted and Calloway Sisters series.",
    birthDate: "1989",
    topWork: "Addicted to You",
  },
  "meghan quinn": {
    bio: "Meghan Quinn is a #1 Amazon and USA Today bestselling author, wife, and adoptive mother, widely loved for her laugh-out-loud romantic comedies and heartfelt contemporary romances including Rules for the Summer.",
    birthDate: "1986",
    topWork: "Rules for the Summer",
  },
  "lana ferguson": {
    bio: "Lana Ferguson is an American contemporary romance author who writes witty, steamy romances celebrating love, humor, and quirky found families, including The Nanny and The Fake Mate.",
    birthDate: "1991",
    topWork: "The Nanny",
  },
  "rosie danan": {
    bio: "Rosie Danan is an acclaimed contemporary romance author whose novels, including The Roommate, The Intimacy Experiment, and Fan Service, blend smart humor, vulnerability, and modern relationships.",
    birthDate: "1987",
    topWork: "The Roommate",
  },
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
        const lowerName = authorName.toLowerCase();
        if (!cached.photoUrl) {
          for (const [key, photo] of Object.entries(CURATED_AUTHOR_PHOTOS)) {
            if (lowerName === key || lowerName.includes(key)) {
              cached.photoUrl = photo;
              break;
            }
          }
        }
        if (!cached.bio) {
          for (const [key, details] of Object.entries(CURATED_AUTHOR_BIOS)) {
            if (lowerName === key || lowerName.includes(key)) {
              cached.bio = details.bio;
              cached.birthDate = cached.birthDate || details.birthDate;
              cached.topWork = cached.topWork || details.topWork;
              break;
            }
          }
        }
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

  // Check curated photo & bio override
  const lowerName = authorName.toLowerCase();
  for (const [key, photo] of Object.entries(CURATED_AUTHOR_PHOTOS)) {
    if (lowerName === key || lowerName.includes(key)) {
      metadata.photoUrl = photo;
      break;
    }
  }
  for (const [key, details] of Object.entries(CURATED_AUTHOR_BIOS)) {
    if (lowerName === key || lowerName.includes(key)) {
      metadata.bio = details.bio;
      metadata.birthDate = details.birthDate;
      metadata.topWork = details.topWork;
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
