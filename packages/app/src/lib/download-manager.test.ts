import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DownloadTask, downloadManager } from "./download-manager";
import type { OfflineBookMeta } from "./opfs";

describe("Download Manager Engine", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockStorage = {
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
    };
    vi.stubGlobal("window", { localStorage: mockStorage });
    vi.stubGlobal("localStorage", mockStorage);

    vi.stubGlobal("navigator", {
      storage: {
        getDirectory: vi.fn(),
      },
    });
  });

  afterEach(async () => {
    await downloadManager.cancelAll();
    vi.restoreAllMocks();
  });

  it("adds items to the download queue and respects task metadata", async () => {
    const meta: OfflineBookMeta = {
      bookId: "book-test-1",
      title: "The Way of Kings",
      author: "Brandon Sanderson",
      durationSeconds: 150000,
      fileSizeBytes: 500000000,
      downloadedAt: Date.now(),
    };

    // Mock isOpfsSupported to true
    vi.spyOn(navigator.storage, "getDirectory").mockImplementation(
      async () => ({}) as unknown as FileSystemDirectoryHandle,
    );

    await downloadManager.enqueue(meta);

    const task = downloadManager.getTask("book-test-1");
    expect(task).toBeDefined();
    expect(task?.title).toBe("The Way of Kings");
    expect(task?.totalBytes).toBe(500000000);
  });

  it("allows pausing and resuming active download tasks", async () => {
    const meta: OfflineBookMeta = {
      bookId: "book-pause-test",
      title: "Words of Radiance",
      author: "Brandon Sanderson",
      durationSeconds: 160000,
      fileSizeBytes: 600000000,
      downloadedAt: Date.now(),
    };

    await downloadManager.enqueue(meta);
    downloadManager.pause("book-pause-test");

    const task = downloadManager.getTask("book-pause-test");
    expect(task?.status).toBe("paused");

    downloadManager.resume("book-pause-test");
    const resumedTask = downloadManager.getTask("book-pause-test");
    expect(["queued", "downloading"]).toContain(resumedTask?.status);
  });

  it("cancels downloads and removes them from the queue", async () => {
    const meta: OfflineBookMeta = {
      bookId: "book-cancel-test",
      title: "Oathbringer",
      author: "Brandon Sanderson",
      durationSeconds: 170000,
      fileSizeBytes: 700000000,
      downloadedAt: Date.now(),
    };

    await downloadManager.enqueue(meta);
    await downloadManager.cancel("book-cancel-test");

    const task = downloadManager.getTask("book-cancel-test");
    expect(task).toBeUndefined();
  });
});
