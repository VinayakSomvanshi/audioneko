import {
  BarChart2,
  BookOpen,
  Bookmark,
  CheckCircle2,
  Clock,
  Headphones,
  Info,
  Loader2,
  Shield,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

export interface UserStatsBookProgress {
  bookId: string;
  bookTitle: string | null;
  bookAuthor: string | null;
  coverR2Key: string | null;
  currentTimeSeconds: number;
  durationSeconds: number;
  progressFraction: number;
  isFinished: boolean | null;
  updatedAt: number | Date;
  bookDuration?: number | null;
}

export interface UserStatsResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: "admin" | "listener";
    createdAt: number | Date;
    updatedAt: number | Date;
  };
  stats: {
    totalListeningSeconds: number;
    totalSessionsCount: number;
    booksStartedCount: number;
    booksFinishedCount: number;
    totalBookmarksCount: number;
    totalBooksWithProgress: number;
  };
  books: UserStatsBookProgress[];
}

interface UserStatsModalProps {
  userId: string | null;
  userName: string;
  userEmail: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatListeningTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

function formatClockTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function UserStatsModal({
  userId,
  userName,
  userEmail,
  isOpen,
  onClose,
}: UserStatsModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UserStatsResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) {
      setData(null);
      setErrorMsg(null);
      return;
    }

    const fetchStats = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/admin/users/${userId}/stats`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            (errData as { error?: string }).error || "Failed to load user listening stats",
          );
        }
        const json = (await res.json()) as UserStatsResponse;
        setData(json);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Network error loading stats");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [isOpen, userId]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="user-stats-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md w-full h-full border-none max-w-none max-h-none m-0"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="w-full max-w-3xl surface-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-bg/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-accent-bg border border-accent/30 text-accent">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="user-stats-modal-title" className="text-base font-bold text-text">
                  {data?.user?.name || userName}
                </h3>
                <span className="text-[10px] font-mono uppercase tracking-wider text-accent border border-accent/40 bg-accent-bg px-1.5 py-0.5 rounded">
                  {data?.user?.role || "listener"}
                </span>
              </div>
              <p className="text-xs font-mono text-muted">{data?.user?.email || userEmail}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full surface-card border border-border text-[11px] font-mono text-subtle">
              <Shield className="w-3.5 h-3.5 text-accent" />
              <span>Immutable Telemetry</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded text-muted hover:text-text hover:bg-elevated transition-colors cursor-pointer"
              aria-label="Close user stats dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Read-Only Notice Banner */}
        <div className="px-4 sm:px-5 py-2.5 bg-elevated border-b border-border flex items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-muted">
            <Info className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>
              Curator Read-Only Mode: Administrators cannot alter, falsify, or delete listener
              playback telemetry.
            </span>
          </div>
          <span className="text-[10px] uppercase font-bold text-accent shrink-0">Read-Only</span>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <p className="text-xs font-mono text-muted">
                Retrieving listener playback telemetry...
              </p>
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded bg-rose-950/30 border border-rose-800/40 text-rose-400 text-xs font-mono">
              {errorMsg}
            </div>
          ) : data ? (
            <>
              {/* KPI Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="surface-card p-3.5 rounded border border-border space-y-1">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-[11px] font-mono">Total Time</span>
                    <Clock className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <div className="text-lg font-bold font-mono text-text">
                    {formatListeningTime(data.stats.totalListeningSeconds)}
                  </div>
                  <p className="text-[10px] font-mono text-subtle">
                    {data.stats.totalSessionsCount} session
                    {data.stats.totalSessionsCount === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="surface-card p-3.5 rounded border border-border space-y-1">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-[11px] font-mono">In Progress</span>
                    <BarChart2 className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <div className="text-lg font-bold font-mono text-text">
                    {data.stats.booksStartedCount}
                  </div>
                  <p className="text-[10px] font-mono text-subtle">Active audiobooks</p>
                </div>

                <div className="surface-card p-3.5 rounded border border-border space-y-1">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-[11px] font-mono">Completed</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {data.stats.booksFinishedCount}
                  </div>
                  <p className="text-[10px] font-mono text-subtle">Books finished</p>
                </div>

                <div className="surface-card p-3.5 rounded border border-border space-y-1">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-[11px] font-mono">Bookmarks</span>
                    <Bookmark className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <div className="text-lg font-bold font-mono text-text">
                    {data.stats.totalBookmarksCount}
                  </div>
                  <p className="text-[10px] font-mono text-subtle">Saved moments</p>
                </div>
              </div>

              {/* Shelf & Progress Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted">
                    Playback History & Bookshelf ({data.books.length})
                  </h4>
                  <span className="text-[10px] font-mono text-subtle">
                    Sorted by most recent activity
                  </span>
                </div>

                {data.books.length === 0 ? (
                  <div className="p-10 border border-border rounded text-center text-xs font-mono text-muted bg-bg/40">
                    No listening progress or audiobooks tracked yet for this user.
                  </div>
                ) : (
                  <div className="border border-border rounded overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-elevated text-subtle border-b border-border">
                          <tr>
                            <th className="py-2.5 px-4 font-medium">Book</th>
                            <th className="py-2.5 px-4 font-medium">Status</th>
                            <th className="py-2.5 px-4 font-medium">Progress</th>
                            <th className="py-2.5 px-4 font-medium">Position / Length</th>
                            <th className="py-2.5 px-4 font-medium text-right">Last Listened</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {data.books.map((b) => {
                            const isDone =
                              b.isFinished || (b.progressFraction && b.progressFraction >= 0.99);
                            const percent = Math.min(
                              100,
                              Math.round((b.progressFraction || 0) * 100),
                            );
                            const updatedTimestamp = b.updatedAt
                              ? new Date(
                                  typeof b.updatedAt === "number"
                                    ? b.updatedAt * 1000
                                    : b.updatedAt,
                                ).toLocaleDateString()
                              : "N/A";

                            return (
                              <tr key={b.bookId} className="hover:bg-elevated/40 transition-colors">
                                <td className="py-3 px-4 text-text">
                                  <div className="font-semibold text-text truncate max-w-[200px]">
                                    {b.bookTitle || `Book ID: ${b.bookId.slice(0, 10)}...`}
                                  </div>
                                  <div className="text-[11px] text-muted truncate max-w-[200px]">
                                    {b.bookAuthor || "Unknown Author"}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  {isDone ? (
                                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                      Finished
                                    </span>
                                  ) : b.currentTimeSeconds > 0 ? (
                                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                      In Progress
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-elevated text-muted border border-border">
                                      Not Started
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 min-w-[120px]">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 rounded-full bg-elevated overflow-hidden border border-border">
                                      <div
                                        className={`h-full rounded-full ${
                                          isDone ? "bg-emerald-400" : "bg-accent"
                                        }`}
                                        style={{ width: `${percent}%` }}
                                      />
                                    </div>
                                    <span className="text-[11px] font-mono text-muted w-8 text-right">
                                      {percent}%
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-muted text-[11px]">
                                  <span className="text-text font-medium">
                                    {formatClockTime(b.currentTimeSeconds)}
                                  </span>{" "}
                                  / {formatClockTime(b.durationSeconds || b.bookDuration || 0)}
                                </td>
                                <td className="py-3 px-4 text-muted text-right text-[11px]">
                                  {updatedTimestamp}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-end bg-bg/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded surface-card text-muted hover:text-text text-xs font-mono transition-colors cursor-pointer"
          >
            Close Audit View
          </button>
        </div>
      </div>
    </dialog>
  );
}
