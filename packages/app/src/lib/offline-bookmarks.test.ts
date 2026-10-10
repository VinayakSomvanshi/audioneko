import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBookmarkWithOfflineSupport,
  deleteBookmarkWithOfflineSupport,
  fetchBookmarksForBook,
  syncPendingBookmarks,
} from "./offline-bookmarks";

describe("offline-bookmarks", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    });

    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches bookmarks from server when online and caches locally", async () => {
    const mockBookmarks = [
      {
        id: "bm_1",
        bookId: "book_test",
        positionSeconds: 120,
        chapterTitle: "Chapter 1",
        note: "Note 1",
        createdAt: 1000,
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ bookmarks: mockBookmarks }),
      }),
    );

    const result = await fetchBookmarksForBook("book_test");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("bm_1");

    // LocalStorage should now contain cached bookmarks
    const cached = JSON.parse(store["audioneko_bm_book_test"] || "[]");
    expect(cached).toHaveLength(1);
    expect(cached[0]?.id).toBe("bm_1");
  });

  it("falls back to local cache when offline", async () => {
    const cachedItem = {
      id: "bm_cached",
      bookId: "book_offline",
      positionSeconds: 300,
      chapterTitle: "Chapter 3",
      note: "Offline note",
      createdAt: 2000,
    };
    store["audioneko_bm_book_offline"] = JSON.stringify([cachedItem]);

    vi.stubGlobal("navigator", { onLine: false });
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network offline"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchBookmarksForBook("book_offline");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("bm_cached");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("creates bookmark locally when offline and queues for sync", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const created = await createBookmarkWithOfflineSupport({
      bookId: "book_airplane",
      positionSeconds: 450,
      chapterTitle: "Flight Chapter",
      note: "Note taken on plane",
    });

    expect(created.id).toMatch(/^local_bm_/);
    expect(created.positionSeconds).toBe(450);
    expect(created.note).toBe("Note taken on plane");

    const pending = JSON.parse(store["audioneko_pending_bm_creations"] || "[]");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.tempId).toBe(created.id);
  });

  it("syncs pending bookmarks when coming back online", async () => {
    vi.stubGlobal("navigator", { onLine: true });

    store["audioneko_pending_bm_creations"] = JSON.stringify([
      {
        tempId: "local_bm_123",
        bookId: "book_synced",
        positionSeconds: 150,
        chapterTitle: "Ch 1",
        note: "Pending sync",
        createdAt: 3000,
      },
    ]);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bookmark: {
          id: "server_bm_999",
          bookId: "book_synced",
          positionSeconds: 150,
          chapterTitle: "Ch 1",
          note: "Pending sync",
          createdAt: 3000,
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await syncPendingBookmarks();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bookmarks",
      expect.objectContaining({ method: "POST" }),
    );

    const pending = JSON.parse(store["audioneko_pending_bm_creations"] || "[]");
    expect(pending).toHaveLength(0);
  });

  it("deletes offline pending bookmark cleanly", async () => {
    store["audioneko_bm_book_del"] = JSON.stringify([
      {
        id: "local_bm_del_1",
        bookId: "book_del",
        positionSeconds: 200,
        createdAt: 4000,
      },
    ]);
    store["audioneko_pending_bm_creations"] = JSON.stringify([
      {
        tempId: "local_bm_del_1",
        bookId: "book_del",
        positionSeconds: 200,
        createdAt: 4000,
      },
    ]);

    await deleteBookmarkWithOfflineSupport("local_bm_del_1", "book_del");

    const cached = JSON.parse(store["audioneko_bm_book_del"] || "[]");
    expect(cached).toHaveLength(0);

    const pending = JSON.parse(store["audioneko_pending_bm_creations"] || "[]");
    expect(pending).toHaveLength(0);
  });
});
