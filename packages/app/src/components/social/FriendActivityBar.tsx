import type { FriendPresence, SocialPresenceResponse } from "@audioneko/shared";
import { Headphones, Radio, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAudio } from "../../context/audio-context";

interface FriendActivityBarProps {
  onJoinListenAlong?: (roomId: string, bookId: string) => void;
}

function formatRelativeTime(timestampSeconds: number): string {
  if (!timestampSeconds) return "Never";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - timestampSeconds);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function FriendActivityBar({ onJoinListenAlong }: FriendActivityBarProps) {
  const [friends, setFriends] = useState<FriendPresence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { playBook } = useAudio();

  const fetchPresence = useCallback(async () => {
    try {
      const res = await fetch("/api/social/presence");
      if (res.ok) {
        const data = (await res.json()) as SocialPresenceResponse;
        setFriends(data.friends || []);
      }
    } catch {
      // Gracefully handle network/offline state
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresence();
    // Poll every 30s for live listening presence
    const timer = setInterval(fetchPresence, 30000);
    return () => clearInterval(timer);
  }, [fetchPresence]);

  const handleListenAlong = (friend: FriendPresence) => {
    if (!friend.currentBook) return;

    if (onJoinListenAlong) {
      onJoinListenAlong(`room_${friend.userId}`, friend.currentBook.bookId);
    } else {
      // Direct jump to current progress
      playBook(
        {
          id: friend.currentBook.bookId,
          title: friend.currentBook.title,
          author: friend.currentBook.author,
          durationSeconds: friend.currentBook.durationSeconds,
          format: "m4b",
          driveFolderId: "",
          fileSizeBytes: 0,
          isActiveShelf: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        friend.currentBook.currentTimeSeconds,
        [],
      );
    }
  };

  if (isLoading) {
    return (
      <div className="surface-card p-4 border border-border text-center text-xs font-mono text-muted">
        Loading friends activity...
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="surface-card p-6 border border-border text-center space-y-2">
        <Users className="w-5 h-5 text-subtle mx-auto" />
        <p className="text-xs font-mono text-muted">No other friends in this library yet</p>
        <p className="text-[11px] font-mono text-subtle">
          Generate an invite link from Admin Invites to invite friends to your library.
        </p>
      </div>
    );
  }

  return (
    <div className="surface-card border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-text">
            Friend Activity ({friends.filter((f) => f.isOnline).length} Active)
          </h3>
        </div>
        <button
          type="button"
          onClick={fetchPresence}
          className="text-[11px] font-mono text-muted hover:text-text cursor-pointer transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="divide-y divide-border/60">
        {friends.map((friend) => {
          const initials = friend.userName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <div
              key={friend.userId}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar with live pulsating dot */}
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-elevated border border-border flex items-center justify-center font-mono text-xs font-medium text-text overflow-hidden">
                    {friend.userImage ? (
                      <img
                        src={friend.userImage}
                        alt={friend.userName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  {/* Status Indicator */}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg ${
                      friend.isOnline ? "bg-accent logo-dot" : "bg-border"
                    }`}
                    title={friend.isOnline ? "Listening now" : "Offline"}
                  />
                </div>

                {/* Friend Info & Current Book */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text truncate">
                      {friend.userName}
                    </span>
                    <span className="text-[10px] font-mono text-subtle">
                      {friend.isOnline ? "Listening now" : formatRelativeTime(friend.lastActiveAt)}
                    </span>
                  </div>

                  {friend.currentBook ? (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted truncate">
                        <Headphones className="w-3 h-3 shrink-0 text-accent" />
                        <span className="truncate font-medium text-text/90">
                          {friend.currentBook.title}
                        </span>
                        <span className="text-subtle truncate">• {friend.currentBook.author}</span>
                      </div>

                      {/* Mini progress bar */}
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-24 bg-elevated rounded-full overflow-hidden border border-border/50">
                          <div
                            className="h-full bg-accent transition-all duration-300"
                            style={{
                              width: `${Math.round(friend.currentBook.progressFraction * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-subtle">
                          {Math.round(friend.currentBook.progressFraction * 100)}%
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] font-mono text-subtle mt-0.5">
                      No active audiobook session
                    </p>
                  )}
                </div>
              </div>

              {/* Listen Along Action Button */}
              {friend.currentBook && friend.isOnline && (
                <div className="shrink-0 flex items-center gap-2 pl-12 sm:pl-0">
                  <button
                    type="button"
                    onClick={() => handleListenAlong(friend)}
                    className="px-2.5 py-1 text-xs font-mono font-medium rounded bg-accent-bg border border-accent/30 text-accent hover:bg-accent hover:text-bg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    <span>Listen Along</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
