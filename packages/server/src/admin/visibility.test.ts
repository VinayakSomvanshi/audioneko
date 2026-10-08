import { describe, expect, it } from "vitest";
import {
  getBookHiddenStatus,
  getVisibility,
  isAuthorHidden,
  isSeriesHidden,
  setVisibilityRule,
} from "./visibility";

describe("Library Visibility Controls", () => {
  it("determines direct book hidden status", () => {
    const visibility = {
      hiddenBooks: ["book_1"],
      hiddenSeries: [],
      hiddenAuthors: [],
    };

    expect(getBookHiddenStatus({ id: "book_1", author: "Author A" }, visibility)).toEqual({
      isHidden: true,
      reason: "direct",
    });
    expect(getBookHiddenStatus({ id: "book_2", author: "Author A" }, visibility)).toEqual({
      isHidden: false,
    });
  });

  it("cascades series hidden status to books in that series", () => {
    const visibility = {
      hiddenBooks: [],
      hiddenSeries: ["Red Rising", "ser_iron"],
      hiddenAuthors: [],
    };

    expect(
      getBookHiddenStatus(
        { id: "book_rr1", author: "Pierce Brown", series: "Red Rising" },
        visibility,
      ),
    ).toEqual({
      isHidden: true,
      reason: "series",
    });

    expect(
      getBookHiddenStatus(
        { id: "book_rr2", author: "Pierce Brown", seriesName: "Red Rising" },
        visibility,
      ),
    ).toEqual({
      isHidden: true,
      reason: "series",
    });

    expect(
      getBookHiddenStatus(
        { id: "book_rr3", author: "Pierce Brown", seriesId: "ser_iron" },
        visibility,
      ),
    ).toEqual({
      isHidden: true,
      reason: "series",
    });

    expect(
      getBookHiddenStatus(
        { id: "book_other", author: "Pierce Brown", series: "Other Series" },
        visibility,
      ),
    ).toEqual({
      isHidden: false,
    });
  });

  it("cascades author hidden status to all books by that author", () => {
    const visibility = {
      hiddenBooks: [],
      hiddenSeries: [],
      hiddenAuthors: ["Pierce Brown"],
    };

    expect(isAuthorHidden("Pierce Brown", visibility)).toBe(true);
    expect(isAuthorHidden("pierce brown", visibility)).toBe(true);
    expect(isAuthorHidden("Brandon Sanderson", visibility)).toBe(false);

    expect(
      getBookHiddenStatus(
        { id: "book_1", author: "Pierce Brown", series: "Red Rising" },
        visibility,
      ),
    ).toEqual({
      isHidden: true,
      reason: "author",
    });

    expect(
      getBookHiddenStatus({ id: "book_2", author: "Brandon Sanderson" }, visibility),
    ).toEqual({
      isHidden: false,
    });
  });

  it("prioritizes direct book hidden status over series or author", () => {
    const visibility = {
      hiddenBooks: ["book_1"],
      hiddenSeries: ["Red Rising"],
      hiddenAuthors: ["Pierce Brown"],
    };

    expect(
      getBookHiddenStatus(
        { id: "book_1", author: "Pierce Brown", series: "Red Rising" },
        visibility,
      ),
    ).toEqual({
      isHidden: true,
      reason: "direct",
    });
  });

  it("saves and retrieves rules with KV cache", async () => {
    const kvStore = new Map<string, string>();
    const mockKV = {
      get: async (key: string, type: string) => {
        const val = kvStore.get(key);
        if (!val) return null;
        if (type === "json") return JSON.parse(val);
        return val;
      },
      put: async (key: string, val: string) => {
        kvStore.set(key, val);
      },
    };

    const initial = await getVisibility({ KV: mockKV as any });
    expect(initial).toEqual({
      hiddenBooks: [],
      hiddenSeries: [],
      hiddenAuthors: [],
    });

    // Directly prime KV cache
    await mockKV.put(
      "audioneko_visibility",
      JSON.stringify({
        hiddenBooks: ["book_abc"],
        hiddenSeries: ["Series XYZ"],
        hiddenAuthors: ["Author 1"],
      }),
    );

    const updated = await getVisibility({ KV: mockKV as any });
    expect(updated.hiddenBooks).toContain("book_abc");
    expect(updated.hiddenSeries).toContain("Series XYZ");
    expect(updated.hiddenAuthors).toContain("Author 1");
  });
});
