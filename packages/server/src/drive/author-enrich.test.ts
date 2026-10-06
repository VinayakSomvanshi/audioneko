import { describe, expect, it, vi } from "vitest";
import { enrichAuthorMetadata, normalizeAuthorName } from "./author-enrich";

describe("Dynamic Author Enrichment Engine", () => {
  it("normalizes author names properly", () => {
    expect(normalizeAuthorName("Yarros, Rebecca")).toBe("Rebecca Yarros");
    expect(normalizeAuthorName("Maas, Sarah J.")).toBe("Sarah J. Maas");
    expect(normalizeAuthorName("   Ali Hazelwood   ")).toBe("Ali Hazelwood");
    expect(normalizeAuthorName("Unknown Author")).toBe("Unknown Author");
    expect(normalizeAuthorName("")).toBe("Unknown Author");
  });

  it("fetches and extracts author metadata from Open Library mock", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("search/authors.json")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              numFound: 1,
              docs: [
                {
                  key: "OL7825177A",
                  name: "Rebecca Yarros",
                  birth_date: "14 april 1981",
                  top_work: "Iron Flame",
                  work_count: 40,
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }

      if (url.includes("authors/OL7825177A.json")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              key: "/authors/OL7825177A",
              name: "Rebecca Yarros",
              bio: { type: "/type/text", value: "Bestselling author of Fourth Wing." },
              photos: [15133439],
              remote_ids: { goodreads: "7539785", wikidata: "Q121091992" },
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const res = await enrichAuthorMetadata(
      "Rebecca Yarros",
      undefined,
      mockFetch as unknown as typeof fetch,
    );

    expect(res.name).toBe("Rebecca Yarros");
    expect(res.openLibraryKey).toBe("OL7825177A");
    expect(res.birthDate).toBe("14 april 1981");
    expect(res.topWork).toBe("Iron Flame");
    expect(res.bio).toBe("Bestselling author of Fourth Wing.");
    expect(res.photoUrl).toBe("https://covers.openlibrary.org/a/id/15133439-L.jpg");
    expect(res.goodreadsId).toBe("7539785");
    expect(res.wikidataId).toBe("Q121091992");
  });

  it("prioritizes KV cache when available", async () => {
    const mockKV = {
      get: vi.fn().mockResolvedValue({
        name: "Sarah J. Maas",
        photoUrl: "https://covers.openlibrary.org/a/id/cached-photo.jpg",
        bio: "Cached author bio.",
        birthDate: "05 March 1986",
        topWork: "A Court of Thorns and Roses",
        openLibraryKey: "OL7115219A",
      }),
      put: vi.fn(),
    };

    const mockFetch = vi.fn();

    const res = await enrichAuthorMetadata(
      "Sarah J. Maas",
      { KV: mockKV as unknown as NonNullable<Parameters<typeof enrichAuthorMetadata>[1]>["KV"] },
      mockFetch as unknown as typeof fetch,
    );

    expect(mockKV.get).toHaveBeenCalledWith("author_meta:sarah_j__maas", "json");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(res.name).toBe("Sarah J. Maas");
    expect(res.bio).toBe("Cached author bio.");
  });

  it("falls back gracefully on network error or timeout", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const res = await enrichAuthorMetadata(
      "Unknown Writer",
      undefined,
      mockFetch as unknown as typeof fetch,
    );

    expect(res.name).toBe("Unknown Writer");
    expect(res.photoUrl).toBeNull();
    expect(res.bio).toBeNull();
  });

  it("applies curated photo overrides for verified authors", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ numFound: 0 }), { status: 200 }));

    const res = await enrichAuthorMetadata(
      "Meghan Quinn",
      undefined,
      mockFetch as unknown as typeof fetch,
    );

    expect(res.name).toBe("Meghan Quinn");
    expect(res.photoUrl).toBe("https://images.gr-assets.com/authors/1778858370p8/7360513.jpg");
  });
});
