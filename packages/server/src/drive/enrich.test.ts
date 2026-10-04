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
});
