import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type OfflineBookMeta,
  clearAllDownloadedBooks,
  deleteDownloadedBook,
  downloadBookToOpfs,
  getBookCoverBlobUrl,
  getDownloadedBooks,
  getPartialDownloadBytes,
  getStorageEstimate,
  isBookDownloaded,
  isOpfsSupported,
  saveBookCoverToOpfs,
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

  async arrayBuffer(): Promise<ArrayBuffer> {
    return (this.content.buffer as ArrayBuffer).slice(
      this.content.byteOffset,
      this.content.byteOffset + this.content.byteLength,
    );
  }

  stream(): ReadableStream<Uint8Array> {
    const data = this.content;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
  }
}

class MockWritable {
  public chunks: Uint8Array[] = [];
  public closed = false;
  public position = 0;
  private handle: MockFileHandle;

  constructor(handle: MockFileHandle, options?: { keepExistingData?: boolean }) {
    this.handle = handle;
    if (options?.keepExistingData && handle.file.content.byteLength > 0) {
      this.chunks = [new Uint8Array(handle.file.content)];
      this.position = handle.file.content.byteLength;
    }
  }

  async seek(pos: number): Promise<void> {
    this.position = pos;
  }

  async write(data: Uint8Array | string | ArrayBuffer | Blob): Promise<void> {
    let chunk: Uint8Array;
    if (typeof data === "string") {
      chunk = new TextEncoder().encode(data);
    } else if (data instanceof ArrayBuffer) {
      chunk = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      chunk = data;
    } else {
      chunk = new Uint8Array(0);
    }
    this.chunks.push(chunk);
    this.position += chunk.byteLength;
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

  async createWritable(options?: { keepExistingData?: boolean }): Promise<MockWritable> {
    return new MockWritable(this, options);
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

    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:http://localhost/test-blob-url"),
      revokeObjectURL: vi.fn(),
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

    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/api/covers/")) {
        return new Response(new Uint8Array([255, 216, 255]), { status: 200 });
      }
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

  it("resumes partial downloads using HTTP range requests without restarting from zero", async () => {
    // 1. Pre-seed audio.part in OPFS with 4 bytes already written
    const booksDir = await mockRootDir.getDirectoryHandle("audioneko_books", { create: true });
    const bookDir = await booksDir.getDirectoryHandle("book_resume_test", { create: true });
    const partHandle = await bookDir.getFileHandle("audio.part", { create: true });
    const partWritable = await partHandle.createWritable();
    await partWritable.write(new Uint8Array([10, 20, 30, 40]));
    await partWritable.close();

    const partialBefore = await getPartialDownloadBytes("book_resume_test");
    expect(partialBefore).toBe(4);

    let requestedRange = "";
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("/api/covers/")) {
        return new Response(new Uint8Array([255, 216]), { status: 200 });
      }
      requestedRange = (init?.headers as Record<string, string>)?.Range || "";
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([50, 60, 70, 80]));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Range": "bytes 4-7/8",
          "Content-Length": "4",
        },
      });
    });

    const meta: OfflineBookMeta = {
      bookId: "book_resume_test",
      title: "Resumed Book",
      author: "Author",
      durationSeconds: 1000,
      fileSizeBytes: 8,
      downloadedAt: 0,
    };

    await downloadBookToOpfs(meta);

    // Range must have requested starting from 4 bytes!
    expect(requestedRange).toBe("bytes=4-");

    const isDone = await isBookDownloaded("book_resume_test");
    expect(isDone).toBe(true);
  });

  it("stores and resolves book cover images in OPFS", async () => {
    const coverData = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
    await saveBookCoverToOpfs("book_cover_test", coverData.buffer as ArrayBuffer);

    const blobUrl = await getBookCoverBlobUrl("book_cover_test");
    expect(blobUrl).toBe("blob:http://localhost/test-blob-url");
  });

  it("deletes a downloaded book from OPFS cleanly", async () => {
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
