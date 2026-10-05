import { describe, expect, it, vi } from "vitest";
import type { Database } from "../db";
import { ONLINE_THRESHOLD_SECONDS, getFriendsPresence } from "./presence";

describe("Edge Social Presence Engine", () => {
  it("classifies friends as online or offline based on the 5-minute threshold", async () => {
    const now = 1700000000;

    const mockOtherUsers = [
      { id: "usr_alice", name: "Alice", image: null },
      { id: "usr_bob", name: "Bob", image: "https://example.com/bob.jpg" },
      { id: "usr_charlie", name: "Charlie", image: null },
    ];

    let queryCallCount = 0;

    const mockDb = {
      select: vi.fn().mockImplementation(() => {
        queryCallCount++;
        if (queryCallCount === 1) {
          // Users query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue(mockOtherUsers),
              }),
            }),
          };
        }

        // Subsequent progress queries for each user
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation((_condition) => {
                // Alice active 60s ago (ONLINE)
                if (queryCallCount === 2) {
                  return {
                    orderBy: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        all: vi.fn().mockResolvedValue([
                          {
                            bookId: "book_1",
                            currentTime: 1200,
                            duration: 3600,
                            progressFraction: 0.33,
                            updatedAt: now - 60, // 1 min ago
                            bookTitle: "Project Hail Mary",
                            bookAuthor: "Andy Weir",
                            bookCover: "cover_1.jpg",
                          },
                        ]),
                      }),
                    }),
                  };
                }

                // Bob active 1000s ago (OFFLINE)
                if (queryCallCount === 3) {
                  return {
                    orderBy: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        all: vi.fn().mockResolvedValue([
                          {
                            bookId: "book_2",
                            currentTime: 500,
                            duration: 10000,
                            progressFraction: 0.05,
                            updatedAt: now - 1000, // 16 min ago
                            bookTitle: "Dune",
                            bookAuthor: "Frank Herbert",
                            bookCover: null,
                          },
                        ]),
                      }),
                    }),
                  };
                }

                // Charlie has no progress record yet
                return {
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      all: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                };
              }),
            }),
          }),
        };
      }),
    } as unknown as Database;

    const response = await getFriendsPresence("usr_me", mockDb, now);

    expect(response.friends).toHaveLength(3);

    // Online user sorted first (Alice)
    const alice = response.friends.find((f) => f.userId === "usr_alice");
    expect(alice).toBeDefined();
    expect(alice?.isOnline).toBe(true);
    expect(alice?.currentBook?.title).toBe("Project Hail Mary");
    expect(alice?.currentBook?.isPlaying).toBe(true);
    expect(alice?.currentBook?.progressFraction).toBe(0.33);

    // Offline user (Bob)
    const bob = response.friends.find((f) => f.userId === "usr_bob");
    expect(bob).toBeDefined();
    expect(bob?.isOnline).toBe(false);
    expect(bob?.currentBook?.title).toBe("Dune");
    expect(bob?.currentBook?.isPlaying).toBe(false);

    // User without history (Charlie)
    const charlie = response.friends.find((f) => f.userId === "usr_charlie");
    expect(charlie).toBeDefined();
    expect(charlie?.isOnline).toBe(false);
    expect(charlie?.currentBook).toBeNull();

    // Verify online friends are sorted first
    expect(response.friends[0]?.userId).toBe("usr_alice");
  });
});
