/**
 * audioneko: Instant Client-Side Search Engine
 * Powered by MiniSearch for sub-5ms prefix, fuzzy, and multi-field queries
 * with zero network latency and zero recurring server costs.
 */

import MiniSearch, { type SearchResult as MiniSearchResult } from "minisearch";

export interface SearchableBook {
  id: string;
  title: string;
  author: string;
  narrator?: string | null;
  series?: string | null;
  seriesIndex?: number | null;
  description?: string | null;
  durationSeconds?: number;
  publishedYear?: number | null;
  coverUrl?: string | null;
}

export interface BookSearchResult extends SearchableBook {
  score: number;
  match: Record<string, string[]>;
}

/**
 * Creates and initializes a MiniSearch indexing engine with weighted fields and prefix/fuzzy options
 */
export function createMiniSearchEngine(books: SearchableBook[] = []): MiniSearch<SearchableBook> {
  const miniSearch = new MiniSearch<SearchableBook>({
    idField: "id",
    fields: ["title", "author", "narrator", "series", "description"],
    storeFields: [
      "id",
      "title",
      "author",
      "narrator",
      "series",
      "seriesIndex",
      "description",
      "durationSeconds",
      "publishedYear",
      "coverUrl",
    ],
    searchOptions: {
      boost: {
        title: 2.5,
        series: 1.8,
        author: 1.5,
        narrator: 1.2,
        description: 0.8,
      },
      prefix: true,
      fuzzy: 0.2,
    },
  });

  if (books.length > 0) {
    miniSearch.addAll(books);
  }

  return miniSearch;
}

/**
 * Global client search engine singleton for instant query execution
 */
let globalEngine: MiniSearch<SearchableBook> | null = null;
let registeredBooks: SearchableBook[] = [];

/**
 * Populates or refreshes the global search index
 */
export function updateSearchIndex(books: SearchableBook[]): MiniSearch<SearchableBook> {
  registeredBooks = books;
  globalEngine = createMiniSearchEngine(books);
  return globalEngine;
}

/**
 * Executes sub-5ms fuzzy prefix search across the book library
 */
export function searchBooks(
  query: string,
  customEngine: MiniSearch<SearchableBook> | null = null,
  limit = 20,
): BookSearchResult[] {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    // Return first N books if query is empty
    return registeredBooks.slice(0, limit).map((b) => ({
      ...b,
      score: 1,
      match: {},
    }));
  }

  const activeEngine = customEngine ?? globalEngine ?? updateSearchIndex(registeredBooks);

  const rawResults: MiniSearchResult[] = activeEngine.search(cleanQuery, {
    prefix: true,
    fuzzy: (term) => (term.length > 3 ? 0.2 : false),
    boost: {
      title: 2.5,
      series: 1.8,
      author: 1.5,
      narrator: 1.2,
      description: 0.8,
    },
  });

  return rawResults.slice(0, limit).map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author,
    narrator: r.narrator,
    series: r.series,
    seriesIndex: r.seriesIndex,
    description: r.description,
    durationSeconds: r.durationSeconds,
    publishedYear: r.publishedYear,
    coverUrl: r.coverUrl,
    score: r.score,
    match: r.match,
  }));
}
