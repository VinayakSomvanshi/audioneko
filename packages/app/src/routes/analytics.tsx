import type { Book, BookProgressRecord, ListeningAnalyticsResponse } from "@audioneko/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityHeatmap } from "../components/analytics/ActivityHeatmap";
import { CsvImportExportModal } from "../components/analytics/CsvImportExportModal";
import { FriendActivityBar } from "../components/social/FriendActivityBar";

export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [analytics, setAnalytics] = useState<ListeningAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  // Fetch library books & progress for Goodreads / StoryGraph CSV interchange
  const { data: booksData } = useQuery<{ books: Book[] }>({
    queryKey: ["books"],
    queryFn: async () => {
      const res = await fetch("/api/books");
      if (!res.ok) return { books: [] };
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: progressData } = useQuery<{ progress: Record<string, BookProgressRecord> }>({
    queryKey: ["allProgress"],
    queryFn: async () => {
      const res = await fetch("/api/progress/all");
      if (!res.ok) return { progress: {} };
      return res.json();
    },
    staleTime: 30_000,
  });

  const handleApplyMatches = async (matchedBookIds: string[]) => {
    for (const id of matchedBookIds) {
      await fetch(`/api/progress/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentTime: 999999,
          duration: 999999,
          isFinished: true,
        }),
      }).catch(() => {});
    }
    queryClient.invalidateQueries({ queryKey: ["allProgress"] });
    queryClient.invalidateQueries({ queryKey: ["books"] });
  };

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await fetch("/api/analytics/summary");
        if (res.ok) {
          const data = (await res.json()) as ListeningAnalyticsResponse;
          setAnalytics(data);
        }
      } catch {
        // Handle offline / unauthenticated gracefully
      } finally {
        setIsLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-32">
      {/* Back link */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Library</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="surface-card p-4 sm:p-6 md:p-8 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-accent-bg border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-text break-words">
              Listening Analytics & Social
            </h1>
            <p className="text-xs font-mono text-muted mt-0.5 break-words">
              Daily listening streaks, contribution heatmap, and small-group friend activity
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCsvModalOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-surface text-xs font-mono text-text hover:border-accent hover:text-accent transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <FileSpreadsheet className="w-4 h-4 text-accent" />
          <span className="hidden sm:inline">StoryGraph & Goodreads Sync</span>
          <span className="sm:hidden">Sync CSV</span>
        </button>
      </div>

      {/* Analytics & Heatmap Section */}
      {isLoading ? (
        <div className="surface-card p-12 text-center text-sm font-mono text-muted border border-border">
          Loading your listening history...
        </div>
      ) : analytics ? (
        <ActivityHeatmap analytics={analytics} />
      ) : (
        <div className="surface-card p-8 text-center text-xs font-mono text-muted border border-border">
          Start listening to audiobooks to generate streaks and your activity heatmap.
        </div>
      )}

      {/* Social Presence Section */}
      <div className="space-y-4">
        <FriendActivityBar />
      </div>

      <CsvImportExportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        books={booksData?.books || []}
        progressMap={progressData?.progress || {}}
        onApplyMatches={handleApplyMatches}
      />
    </div>
  );
}
