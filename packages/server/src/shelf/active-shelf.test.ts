import { describe, expect, it, vi } from "vitest";
import type { Database } from "../db";
import type { Env, ShelfQueueMessage } from "../types";
import {
  MAX_ACTIVE_SHELF_BYTES,
  dispatchShelfTask,
  evictLruBooks,
  getActiveShelfStatus,
  handleQueueBatch,
  listActiveShelfObjects,
  precacheBookToR2,
} from "./active-shelf";

describe("Cloudflare R2 Active Shelf LRU Cache Engine", () => {
  it("cleanly handles R2 disabled environment (Zero-Cost Invariant)", async () => {
    const mockEnvWithoutR2 = {
      DB: {} as unknown as D1Database,
      KV: {} as unknown as KVNamespace,
      R2: undefined,
    } as unknown as Env;

    const status = await getActiveShelfStatus(mockEnvWithoutR2);
    expect(status.isR2Enabled).toBe(false);
    expect(status.totalCachedBytes).toBe(0);
    expect(status.cachedCount).toBe(0);
    expect(status.books).toEqual([]);

    const eviction = await evictLruBooks(1000, mockEnvWithoutR2);
    expect(eviction.evictedBookIds).toEqual([]);
    expect(eviction.freedBytes).toBe(0);
    expect(eviction.reason).toBe("r2_disabled");

    const precache = await precacheBookToR2("book_1", mockEnvWithoutR2);
    expect(precache.success).toBe(false);
    expect(precache.reason).toBe("r2_disabled");
  });

  it("lists active shelf objects and handles R2 pagination cursors", async () => {
    let callCount = 0;
    const mockR2 = {
      list: vi.fn().mockImplementation((_opts: { cursor?: string }) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            objects: [
              {
                key: "audio/drive_1",
                size: 100 * 1024 * 1024, // 100 MB
                uploaded: new Date(1700000000000),
                customMetadata: { bookId: "book_1", driveFileId: "drive_1" },
              },
            ],
            truncated: true,
            cursor: "cursor_page_2",
          });
        }
        return Promise.resolve({
          objects: [
            {
              key: "audio/drive_2",
              size: 200 * 1024 * 1024, // 200 MB
              uploaded: new Date(1700001000000),
              customMetadata: { bookId: "book_2", driveFileId: "drive_2" },
            },
          ],
          truncated: false,
        });
      }),
    } as unknown as R2Bucket;

    const { objects, totalBytes } = await listActiveShelfObjects(mockR2);

    expect(objects).toHaveLength(2);
    expect(objects[0]?.bookId).toBe("book_1");
    expect(objects[1]?.bookId).toBe("book_2");
    expect(totalBytes).toBe(300 * 1024 * 1024);
    expect(mockR2.list).toHaveBeenCalledTimes(2);
  });

  it("calculates active shelf status and quota percentage against 8.5 GB", async () => {
    const mockR2 = {
      list: vi.fn().mockResolvedValue({
        objects: [
          {
            key: "audio/drive_1",
            size: 850 * 1024 * 1024, // ~850 MB = ~10% of 8.5 GB
            uploaded: new Date(1700000000000),
            customMetadata: { bookId: "book_1" },
          },
        ],
        truncated: false,
      }),
    } as unknown as R2Bucket;

    const mockDb = {
      query: {
        books: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "book_1",
              title: "Project Hail Mary",
              isActiveShelf: true,
            },
          ]),
        },
      },
    } as unknown as Database;

    const mockEnv = {
      R2: mockR2,
      DB: {} as unknown as D1Database,
    } as unknown as Env;

    const status = await getActiveShelfStatus(mockEnv, mockDb);

    expect(status.isR2Enabled).toBe(true);
    expect(status.totalCachedBytes).toBe(850 * 1024 * 1024);
    expect(status.maxCapacityBytes).toBe(MAX_ACTIVE_SHELF_BYTES);
    expect(status.usagePercent).toBe(10);
    expect(status.cachedCount).toBe(1);
    expect(status.books[0]?.title).toBe("Project Hail Mary");
  });

  it("does not evict when total size + headroom is below the 8.5 GB high-water mark", async () => {
    const mockR2 = {
      list: vi.fn().mockResolvedValue({
        objects: [
          {
            key: "audio/drive_1",
            size: 500 * 1024 * 1024, // 500 MB
            uploaded: new Date(),
          },
        ],
        truncated: false,
      }),
      delete: vi.fn(),
    } as unknown as R2Bucket;

    const mockEnv = {
      R2: mockR2,
      DB: {} as unknown as D1Database,
    } as unknown as Env;

    const result = await evictLruBooks(100 * 1024 * 1024, mockEnv);

    expect(result.evictedBookIds).toEqual([]);
    expect(result.freedBytes).toBe(0);
    expect(mockR2.delete).not.toHaveBeenCalled();
  });

  it("evicts least recently accessed books in LRU order when approaching 8.5 GB limit", async () => {
    // Current cache is at 8.0 GB. Incoming book needs 1.0 GB -> exceeds 8.5 GB by 0.5 GB.
    const deletedKeys: string[] = [];

    const mockR2 = {
      list: vi.fn().mockResolvedValue({
        objects: [
          {
            key: "audio/drive_old",
            size: 600 * 1024 * 1024, // 600 MB
            uploaded: new Date(1600000000000),
            customMetadata: { bookId: "book_old", driveFileId: "drive_old" },
          },
          {
            key: "audio/drive_recent",
            size: 7.4 * 1024 * 1024 * 1024, // 7.4 GB
            uploaded: new Date(1700000000000),
            customMetadata: { bookId: "book_recent", driveFileId: "drive_recent" },
          },
        ],
        truncated: false,
      }),
      delete: vi.fn().mockImplementation((key: string) => {
        deletedKeys.push(key);
        return Promise.resolve();
      }),
    } as unknown as R2Bucket;

    const updatedBooks: Array<{ id: string; isActiveShelf: boolean }> = [];

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                groupBy: vi.fn().mockReturnValue({
                  all: vi.fn().mockResolvedValue([
                    {
                      id: "book_old",
                      title: "Old Audiobook",
                      updatedAt: 1600000000,
                      driveFileId: "drive_old",
                      sizeBytes: 600 * 1024 * 1024,
                      lastListenedAt: 1600000000,
                    },
                    {
                      id: "book_recent",
                      title: "Recent Audiobook",
                      updatedAt: 1700000000,
                      driveFileId: "drive_recent",
                      sizeBytes: 7.4 * 1024 * 1024 * 1024,
                      lastListenedAt: 1700000000,
                    },
                  ]),
                }),
              }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((fields: { isActiveShelf: boolean }) => ({
          where: vi.fn().mockImplementation(() => {
            updatedBooks.push({ id: "book_old", isActiveShelf: fields.isActiveShelf });
            return Promise.resolve();
          }),
        })),
      }),
    } as unknown as Database;

    const mockEnv = {
      R2: mockR2,
      DB: {} as unknown as D1Database,
    } as unknown as Env;

    // Need 1.0 GB headroom on an 8.0 GB cache
    const result = await evictLruBooks(1.0 * 1024 * 1024 * 1024, mockEnv, mockDb);

    expect(result.evictedBookIds).toEqual(["book_old"]);
    expect(result.freedBytes).toBe(600 * 1024 * 1024);
    expect(deletedKeys).toContain("audio/drive_old");
    expect(updatedBooks).toEqual([{ id: "book_old", isActiveShelf: false }]);
  });

  it("short-circuits pre-caching when book is already present in R2 with matching size", async () => {
    const mockR2 = {
      head: vi.fn().mockResolvedValue({
        size: 50 * 1024 * 1024, // 50 MB
      }),
      put: vi.fn(),
    } as unknown as R2Bucket;

    const mockDb = {
      query: {
        books: {
          findFirst: vi.fn().mockResolvedValue({
            id: "book_1",
            title: "Dune",
            fileSizeBytes: 50 * 1024 * 1024,
            files: [
              {
                id: "file_1",
                driveFileId: "drive_dune",
                sizeBytes: 50 * 1024 * 1024,
                mimeType: "audio/mp4",
              },
            ],
          }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
    } as unknown as Database;

    const mockEnv = {
      R2: mockR2,
      DB: {} as unknown as D1Database,
    } as unknown as Env;

    const result = await precacheBookToR2("book_1", mockEnv, fetch, mockDb);

    expect(result.success).toBe(true);
    expect(result.alreadyCached).toBe(true);
    expect(result.bytesCached).toBe(50 * 1024 * 1024);
    expect(mockR2.put).not.toHaveBeenCalled();
  });

  it("rejects books that exceed the maximum 8.5 GB Active Shelf capacity", async () => {
    const mockR2 = {
      head: vi.fn().mockResolvedValue(null),
    } as unknown as R2Bucket;

    const mockDb = {
      query: {
        books: {
          findFirst: vi.fn().mockResolvedValue({
            id: "book_huge",
            title: "Encyclopedic Audio Archive",
            fileSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB
            files: [
              {
                id: "file_huge",
                driveFileId: "drive_huge",
                sizeBytes: 10 * 1024 * 1024 * 1024,
              },
            ],
          }),
        },
      },
    } as unknown as Database;

    const mockEnv = {
      R2: mockR2,
      DB: {} as unknown as D1Database,
    } as unknown as Env;

    const result = await precacheBookToR2("book_huge", mockEnv, fetch, mockDb);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("file_exceeds_max_capacity");
  });

  it("pre-caches audio from Google Drive to R2 and updates D1 active shelf flag", async () => {
    let storedR2Key = "";
    let storedMetadata: Record<string, unknown> = {};

    const mockR2 = {
      list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
      head: vi.fn().mockResolvedValue(null),
      put: vi
        .fn()
        .mockImplementation(
          (key: string, _body: unknown, options: { customMetadata: Record<string, unknown> }) => {
            storedR2Key = key;
            storedMetadata = options.customMetadata;
            return Promise.resolve();
          },
        ),
    } as unknown as R2Bucket;

    const mockDb = {
      query: {
        books: {
          findFirst: vi.fn().mockResolvedValue({
            id: "book_ready",
            title: "Neuromancer",
            fileSizeBytes: 45 * 1024 * 1024,
            files: [
              {
                id: "file_neuro",
                driveFileId: "drive_neuro_123",
                sizeBytes: 45 * 1024 * 1024,
                mimeType: "audio/mp4",
              },
            ],
          }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
    } as unknown as Database;

    const mockEnv = {
      R2: mockR2,
      DB: {} as unknown as D1Database,
      KV: {
        get: vi.fn().mockResolvedValue("mock_drive_token"),
      } as unknown as KVNamespace,
      GOOGLE_SA_KEY: JSON.stringify({ client_email: "test@sa.com", private_key: "dummy" }),
    } as unknown as Env;

    const mockCustomFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("googleapis.com/drive/v3/files/drive_neuro_123")) {
        return Promise.resolve(
          new Response(new Uint8Array([1, 2, 3, 4]), {
            status: 200,
            headers: { "Content-Type": "audio/mp4" },
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const result = await precacheBookToR2(
      "book_ready",
      mockEnv,
      mockCustomFetch as unknown as typeof fetch,
      mockDb,
    );

    expect(result.success).toBe(true);
    expect(result.alreadyCached).toBe(false);
    expect(result.bytesCached).toBe(45 * 1024 * 1024);
    expect(storedR2Key).toBe("audio/drive_neuro_123");
    expect(storedMetadata.bookId).toBe("book_ready");
    expect(storedMetadata.driveFileId).toBe("drive_neuro_123");
  });

  it("dispatches task via Cloudflare Queue if bound, or falls back to ctx.waitUntil", async () => {
    const queueSent: unknown[] = [];
    const waitUntilPromises: Promise<unknown>[] = [];

    // Case 1: Queue bound
    const mockEnvWithQueue = {
      SHELF_QUEUE: {
        send: vi.fn().mockImplementation((msg: unknown) => {
          queueSent.push(msg);
          return Promise.resolve();
        }),
      },
    } as unknown as Env;

    const qResult = await dispatchShelfTask(mockEnvWithQueue, {
      type: "precache",
      bookId: "book_q",
      timestamp: Date.now(),
    });

    expect(qResult.dispatched).toBe(true);
    expect(qResult.method).toBe("queue");
    expect(queueSent).toHaveLength(1);

    // Case 2: Zero-cost mode with ctx.waitUntil
    const mockEnvWithoutQueue = {} as Env;
    const mockCtx = {
      waitUntil: vi.fn().mockImplementation((p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      }),
    };

    const wResult = await dispatchShelfTask(
      mockEnvWithoutQueue,
      { type: "precache", bookId: "book_w", timestamp: Date.now() },
      mockCtx,
    );

    expect(wResult.dispatched).toBe(true);
    expect(wResult.method).toBe("waitUntil");
    expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1);
  });

  it("handles incoming Queue batch messages and acknowledges successfully", async () => {
    const acknowledged: boolean[] = [];

    const mockBatch = {
      messages: [
        {
          body: { type: "precache", bookId: "book_test", timestamp: Date.now() },
          ack: vi.fn().mockImplementation(() => acknowledged.push(true)),
          retry: vi.fn(),
        },
      ],
    };

    const mockEnv = {
      R2: undefined, // R2 disabled will cause precache to return false cleanly without throwing
    } as unknown as Env;

    await handleQueueBatch(mockBatch as unknown as MessageBatch<ShelfQueueMessage>, mockEnv);

    expect(acknowledged).toEqual([true]);
  });
});
