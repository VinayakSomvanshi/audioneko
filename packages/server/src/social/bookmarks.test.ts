import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthContextVariables } from "../auth/middleware";
import type { Env } from "../types";

interface TestBookmark {
  id: string;
  userId: string;
  bookId: string;
  positionSeconds: number;
  chapterTitle?: string | null;
  note?: string | null;
  createdAt: string;
}

describe("Bookmarks API Routes", () => {
  const mockUser = {
    id: "usr_123",
    email: "test@audioneko.com",
    name: "Tester",
    emailVerified: true,
    image: null,
    role: "listener" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockApp = (bookmarksState: TestBookmark[] = []) => {
    const app = new Hono<{ Bindings: Env; Variables: AuthContextVariables }>();

    // Mock auth middleware for testing
    app.use("/api/bookmarks/*", async (c, next) => {
      c.set("user", mockUser);
      await next();
    });

    app.get("/api/bookmarks/:bookId", async (c) => {
      const bookId = c.req.param("bookId");
      const user = c.get("user");
      const matched = bookmarksState
        .filter((b) => b.userId === user.id && b.bookId === bookId)
        .sort((a, b) => a.positionSeconds - b.positionSeconds);
      return c.json({ bookmarks: matched });
    });

    app.post("/api/bookmarks", async (c) => {
      const user = c.get("user");
      const body = await c.req.json<{
        bookId: string;
        positionSeconds: number;
        chapterTitle?: string;
        note?: string;
      }>();

      if (!body.bookId || body.positionSeconds === undefined) {
        return c.json({ error: "Missing required fields: bookId, positionSeconds" }, 400);
      }

      const newBm: TestBookmark = {
        id: `bm_${crypto.randomUUID()}`,
        userId: user.id,
        bookId: body.bookId,
        positionSeconds: body.positionSeconds,
        chapterTitle: body.chapterTitle || null,
        note: body.note || null,
        createdAt: new Date().toISOString(),
      };
      bookmarksState.push(newBm);
      return c.json(newBm, 201);
    });

    app.delete("/api/bookmarks/:id", async (c) => {
      const user = c.get("user");
      const bookmarkId = c.req.param("id");
      const index = bookmarksState.findIndex((b) => b.id === bookmarkId && b.userId === user.id);
      if (index !== -1) {
        bookmarksState.splice(index, 1);
      }
      return c.json({ success: true });
    });

    return app;
  };

  it("POST /api/bookmarks validates required fields", async () => {
    const app = createMockApp();
    const res = await app.request("https://audioneko.app/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: "book_1" }), // Missing positionSeconds
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing required fields");
  });

  it("POST /api/bookmarks creates a bookmark successfully", async () => {
    const store: TestBookmark[] = [];
    const app = createMockApp(store);

    const res = await app.request("https://audioneko.app/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: "book_1",
        positionSeconds: 125.5,
        chapterTitle: "Chapter 1",
        note: "Favorite quote here",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as TestBookmark;
    expect(body.id).toMatch(/^bm_/);
    expect(body.userId).toBe(mockUser.id);
    expect(body.bookId).toBe("book_1");
    expect(body.positionSeconds).toBe(125.5);
    expect(body.chapterTitle).toBe("Chapter 1");
    expect(body.note).toBe("Favorite quote here");
    expect(store.length).toBe(1);
  });

  it("GET /api/bookmarks/:bookId returns sorted bookmarks for book", async () => {
    const store: TestBookmark[] = [
      {
        id: "bm_1",
        userId: mockUser.id,
        bookId: "book_1",
        positionSeconds: 500,
        chapterTitle: "Chapter 3",
        note: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: "bm_2",
        userId: mockUser.id,
        bookId: "book_1",
        positionSeconds: 100,
        chapterTitle: "Chapter 1",
        note: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: "bm_other_book",
        userId: mockUser.id,
        bookId: "book_2",
        positionSeconds: 50,
        chapterTitle: null,
        note: null,
        createdAt: new Date().toISOString(),
      },
    ];
    const app = createMockApp(store);

    const res = await app.request("https://audioneko.app/api/bookmarks/book_1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bookmarks: TestBookmark[] };
    expect(body.bookmarks.length).toBe(2);
    // Verified ascending sort by positionSeconds
    expect(body.bookmarks[0]?.positionSeconds).toBe(100);
    expect(body.bookmarks[1]?.positionSeconds).toBe(500);
  });

  it("DELETE /api/bookmarks/:id removes bookmark", async () => {
    const store: TestBookmark[] = [
      {
        id: "bm_to_delete",
        userId: mockUser.id,
        bookId: "book_1",
        positionSeconds: 100,
        createdAt: new Date().toISOString(),
      },
    ];
    const app = createMockApp(store);

    const res = await app.request("https://audioneko.app/api/bookmarks/bm_to_delete", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    expect(store.length).toBe(0);
  });
});
