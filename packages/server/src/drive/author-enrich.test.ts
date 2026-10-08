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
                  key: "OL22392A",
                  name: "Brandon Sanderson",
                  birth_date: "19 December 1975",
                  top_work: "Mistborn",
                  work_count: 50,
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }

      if (url.includes("authors/OL22392A.json")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              key: "/authors/OL22392A",
              name: "Brandon Sanderson",
              bio: { type: "/type/text", value: "Bestselling fantasy author." },
              photos: [15133439],
              remote_ids: { goodreads: "38550", wikidata: "Q457608" },
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const res = await enrichAuthorMetadata(
      "Brandon Sanderson",
      undefined,
      mockFetch as unknown as typeof fetch,
    );

    expect(res.name).toBe("Brandon Sanderson");
    expect(res.openLibraryKey).toBe("OL22392A");
    expect(res.birthDate).toBe("19 December 1975");
    expect(res.topWork).toBe("Mistborn");
    expect(res.bio).toBe("Bestselling fantasy author.");
    expect(res.photoUrl).toBe("https://covers.openlibrary.org/a/id/15133439-L.jpg");
    expect(res.goodreadsId).toBe("38550");
    expect(res.wikidataId).toBe("Q457608");
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
    expect(res.photoUrl).toBe(
      "https://authormeghanquinn.com/cdn/shop/files/mq_1200x628_9d5d22dd-2ba3-4ea6-8993-24d829ff4ed3.png",
    );
  });
});
