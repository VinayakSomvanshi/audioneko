import { describe, expect, it } from "vitest";
import {
  type SearchableBook,
  createMiniSearchEngine,
  searchBooks,
  updateSearchIndex,
} from "./search";

describe("Instant Client-Side Search Engine (MiniSearch)", () => {
  const testBooks: SearchableBook[] = [
    {
      id: "b_1",
      title: "Project Hail Mary",
      author: "Andy Weir",
      narrator: "Ray Porter",
      durationSeconds: 57900,
      publishedYear: 2021,
      description: "Ryland Grace is the sole survivor on a desperate last-chance mission.",
    },
    {
      id: "b_2",
      title: "The Way of Kings",
      author: "Brandon Sanderson",
      narrator: "Michael Kramer & Kate Reading",
      series: "The Stormlight Archive",
      seriesIndex: 1,
      durationSeconds: 164160,
      publishedYear: 2010,
      description: "Roshar is a world of stone and storms.",
    },
    {
      id: "b_3",
      title: "Dune",
      author: "Frank Herbert",
      narrator: "George Guidall",
      series: "Dune Chronicles",
      seriesIndex: 1,
      durationSeconds: 75600,
      publishedYear: 1965,
      description: "A sweeping science fiction masterpiece set on the desert planet Arrakis.",
    },
    {
      id: "b_4",
      title: "Words of Radiance",
      author: "Brandon Sanderson",
      narrator: "Michael Kramer & Kate Reading",
      series: "The Stormlight Archive",
      seriesIndex: 2,
      durationSeconds: 174000,
      publishedYear: 2014,
      description: "The Knights Radiant must stand again.",
    },
  ];

  it("indexes books and executes instant prefix search on title", () => {
    const engine = createMiniSearchEngine(testBooks);

    const res1 = searchBooks("dun", engine);
    expect(res1.length).toBeGreaterThanOrEqual(1);
    expect(res1[0]?.title).toBe("Dune");

    const res2 = searchBooks("proj", engine);
    expect(res2.length).toBeGreaterThanOrEqual(1);
    expect(res2[0]?.title).toBe("Project Hail Mary");
  });

  it("searches across author, narrator, and series fields with weighting", () => {
    const engine = createMiniSearchEngine(testBooks);

    // Author search
    const byAuthor = searchBooks("weir", engine);
    expect(byAuthor[0]?.author).toBe("Andy Weir");

    // Narrator search
    const byNarrator = searchBooks("porter", engine);
    expect(byNarrator[0]?.narrator).toBe("Ray Porter");

    // Series search
    const bySeries = searchBooks("stormlight", engine);
    expect(bySeries.length).toBe(2);
    expect(bySeries.map((b) => b.title)).toContain("The Way of Kings");
    expect(bySeries.map((b) => b.title)).toContain("Words of Radiance");
  });

  it("performs fuzzy matching for slight typographical errors", () => {
    const engine = createMiniSearchEngine(testBooks);

    // "herbrt" -> "Herbert"
    const fuzzyAuthor = searchBooks("herbrt", engine);
    expect(fuzzyAuthor.length).toBeGreaterThanOrEqual(1);
    expect(fuzzyAuthor[0]?.author).toBe("Frank Herbert");

    // "sandrson" -> "Sanderson"
    const fuzzySanderson = searchBooks("sandrson", engine);
    expect(fuzzySanderson.length).toBeGreaterThanOrEqual(1);
    expect(fuzzySanderson[0]?.author).toBe("Brandon Sanderson");
  });

  it("searches inside book descriptions", () => {
    const engine = createMiniSearchEngine(testBooks);

    const descSearch = searchBooks("desert", engine);
    expect(descSearch.length).toBe(1);
    expect(descSearch[0]?.title).toBe("Dune");

    const survivorSearch = searchBooks("survivor", engine);
    expect(survivorSearch.length).toBe(1);
    expect(survivorSearch[0]?.title).toBe("Project Hail Mary");
  });

  it("returns registered books on empty query and respects limit", () => {
    updateSearchIndex(testBooks);

    const emptyRes = searchBooks("");
    expect(emptyRes).toHaveLength(4);
    expect(emptyRes[0]?.id).toBe("b_1");

    const limitedRes = searchBooks("", null, 2);
    expect(limitedRes).toHaveLength(2);
  });

  it("guarantees sub-5ms search execution latency on client memory", () => {
    const engine = createMiniSearchEngine(testBooks);

    // Warm up engine
    searchBooks("dune", engine);

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      searchBooks("sanderson", engine);
      searchBooks("hail", engine);
    }
    const totalDuration = performance.now() - start;
    const avgDuration = totalDuration / 100;

    // Average search must be well under 5ms (usually < 0.1ms)
    expect(avgDuration).toBeLessThan(5);
  });
});
