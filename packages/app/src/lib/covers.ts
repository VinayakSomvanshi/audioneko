/**
 * audioneko: Book Cover Resolution Helper
 * Directly serves CDN covers (e.g. iTunes mzstatic) or cache-busted proxy endpoint for Google Drive
 */

export function getBookCoverUrl(book: {
  id?: string;
  bookId?: string;
  coverR2Key?: string | null;
  updatedAt?: number | null;
}): string {
  const id = book.id || book.bookId || "";
  if (book.coverR2Key?.startsWith("http://") || book.coverR2Key?.startsWith("https://")) {
    return book.coverR2Key;
  }
  return `/api/covers/${id}?v=${book.updatedAt || 1}`;
}
