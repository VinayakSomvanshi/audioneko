import { describe, expect, it, vi } from "vitest";
import { enrichBookMetadata } from "./enrich";

describe("External Metadata Enrichment Engine (Open Library & Google Books)", () => {
  it("enriches book with Open Library covers and publication metadata", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("openlibrary.org")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              numFound: 1,
              docs: [
                {
                  title: "Dune",
                  author_name: ["Frank Herbert"],
                  first_publish_year: 1965,
                  cover_i: 1234567,
                  isbn: ["9780441172719"],
                  subject: ["Science Fiction", "Space Opera"],
                },
              ],
            }),
        });
      }

      if (url.includes("googleapis.com/books")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              totalItems: 1,
              items: [
                {
                  volumeInfo: {
                    description:
                      "Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides...",
                  },
                },
              ],
            }),
        });
      }

      return Promise.reject(new Error("Unknown URL in test"));
    });

    const enriched = await enrichBookMetadata(
      "Dune: Book 1",
      "Frank Herbert",
      mockFetch as unknown as typeof fetch,
    );

    expect(enriched.title).toBe("Dune: Book 1");
    expect(enriched.author).toBe("Frank Herbert");
    expect(enriched.publishedYear).toBe(1965);
    expect(enriched.coverUrl).toBe("https://covers.openlibrary.org/b/id/1234567-L.jpg");
    expect(enriched.isbn).toBe("9780441172719");
    expect(enriched.description).toContain("Set on the desert planet Arrakis");
    expect(enriched.seriesIndex).toBe(1);
    expect(enriched.genres).toContain("Science Fiction");
  });

  it("gracefully falls back to defaults when external APIs fail or timeout", async () => {
    const mockFailingFetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const enriched = await enrichBookMetadata(
      "Unknown Mystery Book",
      "Indie Author",
      mockFailingFetch as unknown as typeof fetch,
    );

    expect(enriched.title).toBe("Unknown Mystery Book");
    expect(enriched.author).toBe("Indie Author");
    expect(enriched.coverUrl).toBeUndefined();
    expect(enriched.description).toBeUndefined();
  });

  it("selects subsequent doc if first doc has null author and cover (e.g. Rules for the Summer)", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("openlibrary.org/search.json")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              numFound: 2,
              docs: [
                { title: "Rules for the Summer", author_name: null, cover_i: null },
                {
                  title: "Rules for the Summer",
                  author_name: ["Meghan Quinn"],
                  cover_i: 15230153,
                  first_publish_year: 2026,
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const enriched = await enrichBookMetadata(
      "Rules for the Summer",
      "Unknown Author",
      mockFetch as unknown as typeof fetch,
    );

    expect(enriched.author).toBe("Meghan Quinn");
    expect(enriched.coverUrl).toBe("https://covers.openlibrary.org/b/id/15230153-L.jpg");
    expect(enriched.publishedYear).toBe(2026);
  });

  it("handles leading articles fallback (e.g. The Nanny -> Nanny)", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("title=The+Nanny")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ numFound: 0, docs: [] }),
        });
      }
      if (url.includes("title=Nanny")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              numFound: 1,
              docs: [
                {
                  title: "Nanny",
                  author_name: ["Lana Ferguson"],
                  cover_i: 13237568,
                  first_publish_year: 2023,
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const enriched = await enrichBookMetadata(
      "The Nanny",
      "Lana Ferguson",
      mockFetch as unknown as typeof fetch,
    );

    expect(enriched.author).toBe("Lana Ferguson");
    expect(enriched.coverUrl).toBe("https://covers.openlibrary.org/b/id/13237568-L.jpg");
    expect(enriched.publishedYear).toBe(2023);
  });

  it("enriches book with authentic 1:1 square artwork from iTunes Audiobook API", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("itunes.apple.com/search")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              resultCount: 1,
              results: [
                {
                  collectionName: "Addicted to You (Addicted Series)",
                  artistName: "Krista Ritchie & Becca Ritchie",
                  artworkUrl100:
                    "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/test.jpg/100x100bb.jpg",
                  releaseDate: "2013-06-19T07:00:00Z",
                  primaryGenreName: "Romance",
                  description: "She is addicted to sex. He is addicted to booze.",
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const enriched = await enrichBookMetadata(
      "Addicted to You",
      "Unknown Author",
      mockFetch as unknown as typeof fetch,
    );

    expect(enriched.author).toBe("Krista Ritchie & Becca Ritchie");
    expect(enriched.coverUrl).toBe(
      "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/test.jpg/600x600bb.jpg",
    );
    expect(enriched.publishedYear).toBe(2013);
    expect(enriched.genres).toContain("Romance");
    expect(enriched.description).toBe("She is addicted to sex. He is addicted to booze.");
  });
});
