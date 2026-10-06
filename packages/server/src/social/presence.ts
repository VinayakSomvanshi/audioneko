/**
 * audioneko: Edge Social Presence Engine
 *
 * Tracks real-time presence indicators and current listening status
 * for friends across the private audiobook platform.
 */

import type { FriendPresence, SocialPresenceResponse } from "@audioneko/shared";
import { desc, eq, ne } from "drizzle-orm";
import type { Database } from "../db";
import { books, progress, user } from "../db/schema";

export const ONLINE_THRESHOLD_SECONDS = 300; // 5 minutes

/**
 * Retrieves presence and active listening states for all friends in the group.
 */
export async function getFriendsPresence(
  currentUserId: string,
  db: Database,
  nowTimestamp: number = Math.floor(Date.now() / 1000),
): Promise<SocialPresenceResponse> {
  // 1. Fetch all other registered users in the private group
  const otherUsers = await db
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
    })
    .from(user)
    .where(ne(user.id, currentUserId))
    .all();

  const friends: FriendPresence[] = [];

  for (const u of otherUsers) {
    // 2. Fetch user's most recently updated progress record with book details
    const recentProgress = await db
      .select({
        bookId: progress.bookId,
        currentTime: progress.currentTimeSeconds,
        duration: progress.durationSeconds,
        progressFraction: progress.progressFraction,
        updatedAt: progress.updatedAt,
        bookTitle: books.title,
        bookAuthor: books.author,
        bookCover: books.coverR2Key,
      })
      .from(progress)
      .innerJoin(books, eq(books.id, progress.bookId))
      .where(eq(progress.userId, u.id))
      .orderBy(desc(progress.updatedAt))
      .limit(1)
      .all();

    const latest = recentProgress[0];
    const lastActiveAt = latest?.updatedAt
      ? typeof latest.updatedAt === "number"
        ? latest.updatedAt
        : Math.floor(new Date(latest.updatedAt).getTime() / 1000)
      : 0;

    const isOnline = lastActiveAt > 0 && nowTimestamp - lastActiveAt <= ONLINE_THRESHOLD_SECONDS;

    friends.push({
      userId: u.id,
      userName: u.name,
      userImage: u.image,
      isOnline,
      lastActiveAt,
      currentBook: latest
        ? {
            bookId: latest.bookId,
            title: latest.bookTitle,
            author: latest.bookAuthor,
            coverR2Key: latest.bookCover,
            progressFraction: latest.progressFraction,
            currentTimeSeconds: latest.currentTime,
            durationSeconds: latest.duration,
            isPlaying: isOnline,
          }
        : null,
    });
  }

  // Sort: online friends first, then by most recent activity
  friends.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return b.lastActiveAt - a.lastActiveAt;
  });

  return { friends };
}
