import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type OfflineBookMeta,
  clearAllDownloadedBooks,
  deleteDownloadedBook,
  downloadBookToOpfs,
  getDownloadedBooks,
  getStorageEstimate,
  isBookDownloaded,
  isOpfsSupported,
} from "./opfs";

// Mock OPFS filesystem in-memory structures
class MockFile {
  public size: number;
  public content: Uint8Array;
  public type: string;

  constructor(content: Uint8Array, type = "audio/mp4") {
    this.content = content;
    this.size = content.byteLength;
    this.type = type;
  }

  async text(): Promise<string> {
    return new TextDecoder().decode(this.content);
  }

  slice(start = 0, end = this.size, type = this.type): MockFile {
    const sliced = this.content.slice(start, end);
    return new MockFile(sliced, type);
  }
}

class MockWritable {
  public chunks: Uint8Array[] = [];
  public closed = false;
  private handle: MockFileHandle;

  constructor(handle: MockFileHandle) {
    this.handle = handle;
  }

  async write(data: Uint8Array | string): Promise<void> {
    const chunk = typeof data === "string" ? new TextEncoder().encode(data) : data;
    this.chunks.push(chunk);
  }

  async close(): Promise<void> {
    this.closed = true;
    let totalLen = 0;
    for (const c of this.chunks) totalLen += c.byteLength;
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of this.chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    this.handle.file = new MockFile(merged);
  }

  async abort(): Promise<void> {
    this.closed = true;
  }
}

class MockFileHandle {
  public kind = "file" as const;
  public name: string;
  public file: MockFile;

  constructor(name: string, initialContent?: Uint8Array) {
    this.name = name;
    this.file = new MockFile(initialContent ?? new Uint8Array(0));
  }

  async getFile(): Promise<MockFile> {
    return this.file;
  }

  async createWritable(): Promise<MockWritable> {
    return new MockWritable(this);
  }
}

class MockDirectoryHandle {
  public kind = "directory" as const;
  public name: string;
  public children = new Map<string, MockDirectoryHandle | MockFileHandle>();

  constructor(name: string) {
    this.name = name;
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<MockDirectoryHandle> {
    let child = this.children.get(name);
    if (!child) {
      if (options?.create) {
        child = new MockDirectoryHandle(name);
        this.children.set(name, child);
      } else {
        throw new Error(`Directory ${name} not found`);
      }
    }
    return child as MockDirectoryHandle;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileHandle> {
    let child = this.children.get(name);
    if (!child) {
      if (options?.create) {
        child = new MockFileHandle(name);
        this.children.set(name, child);
      } else {
        throw new Error(`File ${name} not found`);
      }
    }
    return child as MockFileHandle;
  }

  async removeEntry(name: string, _options?: { recursive?: boolean }): Promise<void> {
    this.children.delete(name);
  }

  async *values(): AsyncIterable<MockDirectoryHandle | MockFileHandle> {
    for (const item of this.children.values()) {
      yield item;
    }
  }
}

describe("Origin Private File System (OPFS) Download Manager", () => {
  let mockRootDir: MockDirectoryHandle;

  beforeEach(() => {
    mockRootDir = new MockDirectoryHandle("root");

    vi.stubGlobal("navigator", {
      storage: {
        getDirectory: async () => mockRootDir,
        estimate: async () => ({
          usage: 1024 * 1024 * 100, // 100 MB
          quota: 1024 * 1024 * 1000, // 1 GB
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects OPFS support correctly", () => {
    expect(isOpfsSupported()).toBe(true);
  });

  it("calculates storage usage and percentage", async () => {
    const est = await getStorageEstimate();
    expect(est.usageBytes).toBe(104857600);
    expect(est.quotaBytes).toBe(1048576000);
    expect(est.percentUsed).toBe(10);
  });

  it("downloads audio stream into OPFS using streaming chunks and writes meta", async () => {
    const samplePayload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    // Mock fetch streaming response
    vi.stubGlobal("fetch", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(samplePayload.slice(0, 4));
          controller.enqueue(samplePayload.slice(4));
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { "Content-Length": "8" },
      });
    });

    const meta: OfflineBookMeta = {
      bookId: "book_offline_1",
      title: "Project Hail Mary",
      author: "Andy Weir",
      durationSeconds: 50000,
      fileSizeBytes: 8,
      downloadedAt: 0,
    };

    let latestPercent = 0;
    await downloadBookToOpfs(meta, {
      onProgress: (p) => {
        latestPercent = p.progressPercent;
      },
    });

    expect(latestPercent).toBe(100);

    const isDownloaded = await isBookDownloaded("book_offline_1");
    expect(isDownloaded).toBe(true);

    const books = await getDownloadedBooks();
    expect(books).toHaveLength(1);
    expect(books[0]?.bookId).toBe("book_offline_1");
    expect(books[0]?.title).toBe("Project Hail Mary");
    expect(books[0]?.fileSizeBytes).toBe(8);
  });

  it("deletes a downloaded book from OPFS cleanly", async () => {
    // Seed book in mock directory
    const booksDir = await mockRootDir.getDirectoryHandle("audioneko_books", {
      create: true,
    });
    const bookDir = await booksDir.getDirectoryHandle("book_to_delete", {
      create: true,
    });
    await bookDir.getFileHandle("audio.bin", { create: true });
    const metaHandle = await bookDir.getFileHandle("meta.json", { create: true });
    const writable = await metaHandle.createWritable();
    await writable.write(
      new TextEncoder().encode(
        JSON.stringify({
          bookId: "book_to_delete",
          title: "Delete Me",
          author: "Test",
          fileSizeBytes: 10,
        }),
      ),
    );
    await writable.close();

    await deleteDownloadedBook("book_to_delete");

    const isDownloaded = await isBookDownloaded("book_to_delete");
    expect(isDownloaded).toBe(false);
  });

  it("clears all downloaded books from OPFS", async () => {
    await mockRootDir.getDirectoryHandle("audioneko_books", { create: true });
    await clearAllDownloadedBooks();

    const books = await getDownloadedBooks();
    expect(books).toHaveLength(0);
  });
});
