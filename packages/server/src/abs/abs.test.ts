import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AuthContextVariables } from "../auth/middleware";
import type { Database } from "../db";
import type { Env } from "../types";
import { extractAbsToken, requireAbsAuth, resolveAbsUser } from "./auth";
import { mapBookToAbsItem, mapProgressToAbs } from "./mapper";
import { absRoutes } from "./routes";

describe("Audiobookshelf (ABS) API Compatibility Layer", () => {
  describe("Token Extractor & Auth", () => {
    it("extracts token from Authorization: Bearer header", () => {
      const req = new Request("https://audioneko.app/api/v1/me", {
        headers: { Authorization: "Bearer abs_session_token_12345" },
      });
      expect(extractAbsToken(req)).toBe("abs_session_token_12345");
    });

    it("extracts token from x-token header", () => {
      const req = new Request("https://audioneko.app/api/v1/me", {
        headers: { "x-token": "abs_token_header_value" },
      });
      expect(extractAbsToken(req)).toBe("abs_token_header_value");
    });

    it("extracts token from URL query string parameter (?token=...)", () => {
      const req = new Request(
        "https://audioneko.app/api/v1/items/book_1/cover?token=query_token_abc",
      );
      expect(extractAbsToken(req)).toBe("query_token_abc");
    });

    it("returns null when no token is present", () => {
      const req = new Request("https://audioneko.app/api/v1/libraries");
      expect(extractAbsToken(req)).toBeNull();
    });

    it("requireAbsAuth returns 401 Unauthorized when unauthenticated", async () => {
      const app = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();
      app.use("/protected/*", requireAbsAuth);
      app.get("/protected/test", (c) => c.json({ ok: true }));

      const mockEnv = {
        DB: {
          prepare: vi.fn(),
          dump: vi.fn(),
          batch: vi.fn(),
          exec: vi.fn(),
        } as unknown as D1Database,
      } as Env;

      const res = await app.request("https://audioneko.app/protected/test", {}, mockEnv);
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("Data Mappers", () => {
    const mockBook = {
      id: "book_dune_1965",
      title: "Dune",
      author: "Frank Herbert",
      narrator: "George Guidall",
      description: "A sweeping science fiction masterpiece set on the desert planet Arrakis.",
      durationSeconds: 75600,
      fileSizeBytes: 650000000,
      format: "m4b",
      publishedYear: 1965,
      series: { id: "series_dune", name: "Dune Chronicles" },
      seriesIndex: 1,
      createdAt: 1700000000,
      updatedAt: 1700005000,
      chapters: [
        {
          chapterIndex: 1,
          title: "Chapter 1: The Gom Jabbar",
          startTime: 0,
          endTime: 1800,
          duration: 1800,
        },
        {
          chapterIndex: 2,
          title: "Chapter 2: Caladan Departure",
          startTime: 1800,
          endTime: 3600,
          duration: 1800,
        },
      ],
      files: [
        {
          id: "file_dune_part1",
          driveFileId: "drive_file_dune_123",
          name: "Dune.m4b",
          sizeBytes: 650000000,
          mimeType: "audio/mp4",
          trackNumber: 1,
        },
      ],
    };

    const mockProgress = {
      id: "prog_user1_dune",
      bookId: "book_dune_1965",
      currentTimeSeconds: 1200,
      durationSeconds: 75600,
      progressFraction: 0.01587,
      isFinished: false,
      updatedAt: 1700006000,
    };

    it("maps audioneko book entity to ABS AbsLibraryItem schema correctly", () => {
      const item = mapBookToAbsItem(mockBook, mockProgress);

      expect(item.id).toBe("book_dune_1965");
      expect(item.ino).toBe("book_dune_1965");
      expect(item.libraryId).toBe("default-audiobooks");
      expect(item.mediaType).toBe("book");

      // Metadata
      expect(item.media.metadata.title).toBe("Dune");
      expect(item.media.metadata.authorName).toBe("Frank Herbert");
      expect(item.media.metadata.narratorName).toBe("George Guidall");
      expect(item.media.metadata.seriesName).toBe("Dune Chronicles");
      expect(item.media.metadata.series).toHaveLength(1);
      expect(item.media.metadata.series[0]?.name).toBe("Dune Chronicles");
      expect(item.media.metadata.series[0]?.sequence).toBe("1");
      expect(item.media.metadata.publishedYear).toBe("1965");

      // Chapters
      expect(item.media.chapters).toHaveLength(2);
      expect(item.media.chapters[0]?.title).toBe("Chapter 1: The Gom Jabbar");
      expect(item.media.chapters[0]?.start).toBe(0);
      expect(item.media.chapters[0]?.end).toBe(1800);

      // Audio files & tracks
      expect(item.media.audioFiles).toHaveLength(1);
      expect(item.media.audioFiles[0]?.metadata.filename).toBe("Dune.m4b");
      expect(item.media.tracks).toHaveLength(1);
      expect(item.media.tracks[0]?.contentUrl).toBe("/api/stream/drive_file_dune_123");

      // User progress
      expect(item.userMediaProgress).toBeDefined();
      expect(item.userMediaProgress?.currentTime).toBe(1200);
      expect(item.userMediaProgress?.progress).toBe(0.01587);
      expect(item.userMediaProgress?.isFinished).toBe(false);
    });

    it("maps user progress correctly to AbsMediaProgress", () => {
      const absProg = mapProgressToAbs(mockProgress, 75600);

      expect(absProg.id).toBe("prog_user1_dune");
      expect(absProg.libraryItemId).toBe("book_dune_1965");
      expect(absProg.currentTime).toBe(1200);
      expect(absProg.duration).toBe(75600);
      expect(absProg.isFinished).toBe(false);
      expect(absProg.lastUpdate).toBe(1700006000 * 1000);
    });
  });

  describe("HTTP Routes & ABS Compatibility", () => {
    function createMockD1Database(queryResult: unknown = null) {
      const statement = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results: Array.isArray(queryResult) ? queryResult : queryResult ? [queryResult] : [],
          success: true,
        }),
        first: vi.fn().mockResolvedValue(queryResult),
        raw: vi
          .fn()
          .mockResolvedValue(
            Array.isArray(queryResult)
              ? queryResult.map((r) => Object.values(r as Record<string, unknown>))
              : queryResult
                ? [Object.values(queryResult as Record<string, unknown>)]
                : [],
          ),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      };

      return {
        prepare: vi.fn().mockReturnValue(statement),
        dump: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        batch: vi.fn().mockResolvedValue([]),
        exec: vi.fn().mockResolvedValue({ count: 1, duration: 0 }),
      } as unknown as D1Database;
    }

    function createMockEnv(overrides: Record<string, unknown> = {}, queryResult: unknown = null) {
      return {
        DB: createMockD1Database(queryResult),
        R2: undefined,
        KV: {} as KVNamespace,
        SYNC_ROOM: {} as DurableObjectNamespace,
        ASSETS: {} as Fetcher,
        BETTER_AUTH_SECRET: "test_secret_32_characters_long_for_tests",
        APP_URL: "https://audioneko.app",
        ...overrides,
      } as unknown as Env;
    }

    it("GET /ping returns success: true", async () => {
      const res = await absRoutes.request("https://audioneko.app/ping");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true });
    });

    it("GET /status returns initialized server metadata", async () => {
      const res = await absRoutes.request("https://audioneko.app/status");
      expect(res.status).toBe(200);
      const json = (await res.json()) as { isInit: boolean; source: string };
      expect(json.isInit).toBe(true);
      expect(json.source).toBe("audioneko");
    });

    it("GET /items/:id/cover returns fallback SVG cover when R2 image is absent", async () => {
      const mockEnv = createMockEnv(
        {},
        {
          id: "book_test_1",
          title: "Test Book",
          author: "Test Author",
          coverR2Key: null,
        },
      );

      const res = await absRoutes.request(
        "https://audioneko.app/items/book_test_1/cover",
        {},
        mockEnv,
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
      const svgText = await res.text();
      expect(svgText).toContain("<svg");
      expect(svgText).toContain("Test Book");
      expect(svgText).toContain("Test Author");
      expect(svgText).toContain("audioneko");
    });

    it("POST /login validates missing username and password with 400", async () => {
      const res = await absRoutes.request(
        "https://audioneko.app/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        createMockEnv(),
      );

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("Validation failed");
    });
  });
});
