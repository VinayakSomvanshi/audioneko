/**
 * audioneko: Author Photo & Avatar Registry
 * Provides authentic author portraits for catalog and detail views,
 * backed by Open Library, official author publications, and fallback monograms.
 */

const KNOWN_AUTHOR_PHOTOS: Record<string, string> = {
  "ali hazelwood":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Ali_Hazelwood_2025_Texas_Book_Festival.jpg/500px-Ali_Hazelwood_2025_Texas_Book_Festival.jpg",
  "elsie silver":
    "https://images.squarespace-cdn.com/content/v1/6904ff34eb46bd478b74d219/a96d7cb6-21f6-444f-ad98-0934e52c5b4b/194A1682.jpg",
  "krista ritchie":
    "https://static.wixstatic.com/media/bf6fdf_9e881b463379418d95688c942acfbf95~mv2.jpg/v1/fill/w_488,h_524,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Krista%20and%20Becca%20-%20Author%20Photo%202%20-%20Square.jpg",
  "becca ritchie":
    "https://static.wixstatic.com/media/bf6fdf_9e881b463379418d95688c942acfbf95~mv2.jpg/v1/fill/w_488,h_524,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Krista%20and%20Becca%20-%20Author%20Photo%202%20-%20Square.jpg",
  "krista ritchie & becca ritchie":
    "https://static.wixstatic.com/media/bf6fdf_9e881b463379418d95688c942acfbf95~mv2.jpg/v1/fill/w_488,h_524,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Krista%20and%20Becca%20-%20Author%20Photo%202%20-%20Square.jpg",
  "lana ferguson": "https://freshfiction.com/images/authors/48886.jpeg",
  "liz tomforde": "https://static.showit.co/1200/LeiNY5tERxiHZOKslq26Xw/214378/img_1283.jpg",
  "meghan quinn":
    "https://authormeghanquinn.com/cdn/shop/files/mq_1200x628_9d5d22dd-2ba3-4ea6-8993-24d829ff4ed3.png",
  "pierce brown":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Pierce_Brown_by_Gage_Skidmore.jpg/500px-Pierce_Brown_by_Gage_Skidmore.jpg",
  "rebecca yarros":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/NBF2024-rebecca-yarros.jpg/500px-NBF2024-rebecca-yarros.jpg",
  "rebecca yaros":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/NBF2024-rebecca-yarros.jpg/500px-NBF2024-rebecca-yarros.jpg",
  "rosie danan":
    "https://images.squarespace-cdn.com/content/v1/5cdc348cebfc7f30af34bbe6/2d91a297-2d29-4f0b-afef-036cf45e6a71/Rosie_+Danan_portraits_21.jpg",
  "sarah j. maas":
    "https://sarahjmaas.com/wp-content/uploads/2025/03/240117_Today_SarahJMaas_216_resized.jpg",
  "sarah j maas":
    "https://sarahjmaas.com/wp-content/uploads/2025/03/240117_Today_SarahJMaas_216_resized.jpg",
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
