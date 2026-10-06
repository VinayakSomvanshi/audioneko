/**
 * audioneko: Author Photo & Avatar Registry
 * Provides authentic author portraits for catalog and detail views,
 * backed by Open Library, official author publications, and fallback monograms.
 */

const KNOWN_AUTHOR_PHOTOS: Record<string, string> = {
  "ali hazelwood": "https://covers.openlibrary.org/a/olid/OL9096427A-M.jpg",
  "elsie silver": "https://covers.openlibrary.org/a/olid/OL10103214A-M.jpg",
  "krista ritchie":
    "https://static.wixstatic.com/media/bf6fdf_9e881b463379418d95688c942acfbf95~mv2.jpg/v1/fill/w_488,h_524,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Krista%20and%20Becca%20-%20Author%20Photo%202%20-%20Square.jpg",
  "krista ritchie & becca ritchie":
    "https://static.wixstatic.com/media/bf6fdf_9e881b463379418d95688c942acfbf95~mv2.jpg/v1/fill/w_488,h_524,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Krista%20and%20Becca%20-%20Author%20Photo%202%20-%20Square.jpg",
  "lana ferguson": "https://freshfiction.com/images/authors/48886.jpeg",
  "liz tomforde": "https://covers.openlibrary.org/a/olid/OL10324088A-M.jpg",
  "meghan quinn": "https://images.gr-assets.com/authors/1778858370p8/7360513.jpg",
  "rebecca yarros": "https://covers.openlibrary.org/a/olid/OL7825177A-M.jpg",
  "rebecca yaros": "https://covers.openlibrary.org/a/olid/OL7825177A-M.jpg",
  "rosie danan":
    "https://images.squarespace-cdn.com/content/v1/5cdc348cebfc7f30af34bbe6/2d91a297-2d29-4f0b-afef-036cf45e6a71/Rosie_+Danan_portraits_21.jpg",
  "sarah j. maas": "https://covers.openlibrary.org/a/olid/OL7115219A-M.jpg",
  "sarah j maas": "https://covers.openlibrary.org/a/olid/OL7115219A-M.jpg",
};

/**
 * Returns author portrait image URL if known.
 */
export function getAuthorPhotoUrl(authorName: string): string | null {
  if (!authorName) return null;
  const normalized = authorName.trim().toLowerCase();

  if (KNOWN_AUTHOR_PHOTOS[normalized]) {
    return KNOWN_AUTHOR_PHOTOS[normalized];
  }

  // Check partial name match (e.g. primary author)
  for (const [key, url] of Object.entries(KNOWN_AUTHOR_PHOTOS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return url;
    }
  }

  return null;
}
