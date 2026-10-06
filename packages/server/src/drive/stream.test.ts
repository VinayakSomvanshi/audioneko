import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import {
  CHUNK_SIZE,
  _resetMetadataMemoryCache,
  getChunkBounds,
  handleAudioStreamRequest,
  parseRangeHeader,
} from "./stream";

describe("Audio Stream Engine & Range Proxy", () => {
  beforeEach(() => {
    _resetMetadataMemoryCache();
  });

  const TOTAL_SIZE = 10 * 1024 * 1024; // 10 MB

  it("parses explicit byte ranges accurately", () => {
    const range = parseRangeHeader("bytes=0-1023", TOTAL_SIZE);
    expect(range).toEqual({ start: 0, end: 1023 });

    const midRange = parseRangeHeader("bytes=5000000-5001023", TOTAL_SIZE);
    expect(midRange).toEqual({ start: 5000000, end: 5001023 });
  });

  it("streams open-ended ranges to end of file per RFC 7233 without buffer fragmentation", () => {
    const range = parseRangeHeader("bytes=0-", TOTAL_SIZE);
    expect(range).toEqual({ start: 0, end: TOTAL_SIZE - 1 });

    const midOpenRange = parseRangeHeader("bytes=2097152-", TOTAL_SIZE);
    expect(midOpenRange).toEqual({ start: 2097152, end: TOTAL_SIZE - 1 });
  });

  it("handles suffix ranges (bytes=-X)", () => {
    const suffix = parseRangeHeader("bytes=-1000", TOTAL_SIZE);
    expect(suffix).toEqual({ start: TOTAL_SIZE - 1000, end: TOTAL_SIZE - 1 });
  });

  it("falls back to full file stream when Range header is missing or non-range", () => {
    const noHeader = parseRangeHeader(null, TOTAL_SIZE);
    expect(noHeader).toEqual({ start: 0, end: TOTAL_SIZE - 1 });

    const invalidHeader = parseRangeHeader("invalid-range", TOTAL_SIZE);
    expect(invalidHeader).toEqual({ start: 0, end: TOTAL_SIZE - 1 });
  });

  it("returns null for unsatisfiable or inverted ranges per RFC 7233", () => {
    const invertedRange = parseRangeHeader("bytes=5000-2000", TOTAL_SIZE);
    expect(invertedRange).toBeNull();

    const outOfBoundsRange = parseRangeHeader("bytes=15000000-", TOTAL_SIZE);
    expect(outOfBoundsRange).toBeNull();
  });

  it("calculates uniform 2 MB chunk bounds correctly", () => {
    const chunk0 = getChunkBounds(500, TOTAL_SIZE);
    expect(chunk0).toEqual({
      chunkIndex: 0,
      chunkStart: 0,
      chunkEnd: CHUNK_SIZE - 1,
    });

    const chunk1 = getChunkBounds(CHUNK_SIZE + 500, TOTAL_SIZE);
    expect(chunk1).toEqual({
      chunkIndex: 1,
      chunkStart: CHUNK_SIZE,
      chunkEnd: 2 * CHUNK_SIZE - 1,
    });

    // Test file boundary capping
    const smallTotal = 3 * 1024 * 1024; // 3 MB
    const lastChunk = getChunkBounds(2 * CHUNK_SIZE + 100, smallTotal);
    expect(lastChunk.chunkEnd).toBe(smallTotal - 1);
  });

  it("handles HEAD requests and returns correct metadata headers without downloading body", async () => {
    const mockEnv = {
      GOOGLE_SA_KEY: JSON.stringify({ client_email: "test@sa.com", private_key: "dummy" }),
      KV: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === "gdrive_access_token") return Promise.resolve("mock_bearer_token");
          if (key.startsWith("gdrive_meta_")) {
            return Promise.resolve({
              size: 52428800, // 50 MB
              mimeType: "audio/mp4",
              name: "sci-fi-audiobook.m4b",
            });
          }
          return Promise.resolve(null);
        }),
        put: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Env;

    const request = new Request("https://audioneko.app/api/stream/file_123", {
      method: "HEAD",
    });

    const response = await handleAudioStreamRequest(request, "file_123", mockEnv);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mp4");
    expect(response.headers.get("Content-Length")).toBe("52428800");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(await response.text()).toBe(""); // Zero body on HEAD
  });

  it("streams from Cloudflare R2 Active Shelf when cached (Tier 2 fast path)", async () => {
    const fakeAudioBytes = new Uint8Array([10, 20, 30, 40, 50]);

    const mockEnv = {
      GOOGLE_SA_KEY: JSON.stringify({ client_email: "test@sa.com", private_key: "dummy" }),
      KV: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === "gdrive_access_token") return Promise.resolve("mock_bearer_token");
          if (key.startsWith("gdrive_meta_")) {
            return Promise.resolve({
              size: 100,
              mimeType: "audio/mp4",
              name: "book.m4b",
            });
          }
          return Promise.resolve(null);
        }),
      },
      R2: {
        get: vi.fn().mockResolvedValue({
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(fakeAudioBytes);
              controller.close();
            },
          }),
        }),
      },
    } as unknown as Env;

    const request = new Request("https://audioneko.app/api/stream/file_123", {
      method: "GET",
      headers: { Range: "bytes=0-4" },
    });

    const response = await handleAudioStreamRequest(request, "file_123", mockEnv);

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-4/100");
    expect(response.headers.get("Content-Length")).toBe("5");
    expect(response.headers.get("X-Audioneko-Tier")).toBe("R2-Active-Shelf");

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes).toEqual(fakeAudioBytes);
  });

  it("returns HTTP 416 Range Not Satisfiable when range is past file boundary", async () => {
    const mockEnv = {
      GOOGLE_SA_KEY: JSON.stringify({ client_email: "test@sa.com", private_key: "dummy" }),
      KV: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === "gdrive_access_token") return Promise.resolve("mock_bearer_token");
          if (key.startsWith("gdrive_meta_")) {
            return Promise.resolve({
              size: 1000,
              mimeType: "audio/mp4",
              name: "book.m4b",
            });
          }
          return Promise.resolve(null);
        }),
      },
    } as unknown as Env;

    const request = new Request("https://audioneko.app/api/stream/file_123", {
      method: "GET",
      headers: { Range: "bytes=2000-3000" },
    });

    const response = await handleAudioStreamRequest(request, "file_123", mockEnv);

    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */1000");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("streams directly from Google Drive API with piped stream and zero-latency headers", async () => {
    const mockAudioBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const mockEnv = {
      GOOGLE_SA_KEY: JSON.stringify({ client_email: "test@sa.com", private_key: "dummy" }),
      KV: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === "gdrive_access_token") return Promise.resolve("mock_bearer_token");
          if (key.startsWith("gdrive_meta_")) {
            return Promise.resolve({
              size: 50 * 1024 * 1024, // 50 MB
              mimeType: "audio/mp4",
              name: "large-book.m4b",
            });
          }
          return Promise.resolve(null);
        }),
      },
    } as unknown as Env;

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(mockAudioBytes);
            controller.close();
          },
        }),
        {
          status: 206,
          headers: {
            "Content-Range": `bytes 0-7/${50 * 1024 * 1024}`,
            "Content-Length": "8",
          },
        },
      ),
    );

    const request = new Request("https://audioneko.app/api/stream/file_123", {
      method: "GET",
      headers: { Range: "bytes=0-7" },
    });

    const response = await handleAudioStreamRequest(
      request,
      "file_123",
      mockEnv,
      mockFetch as unknown as typeof fetch,
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe(`bytes 0-7/${50 * 1024 * 1024}`);
    expect(response.headers.get("Content-Length")).toBe("8");
    expect(response.headers.get("X-Audioneko-Tier")).toBe("Google-Drive-Direct-Stream");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(mockAudioBytes);
  });
});
