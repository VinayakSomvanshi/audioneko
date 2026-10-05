import type { ListeningAnalyticsResponse } from "@audioneko/shared";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityHeatmap } from "../components/analytics/ActivityHeatmap";
import { FriendActivityBar } from "../components/social/FriendActivityBar";

export function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<ListeningAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      <div className="surface-card p-6 md:p-8 border border-border flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-accent-bg border border-accent/20 flex items-center justify-center text-accent">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-text">
              Listening Analytics & Social
            </h1>
            <p className="text-xs font-mono text-muted mt-0.5">
              Daily listening streaks, contribution heatmap, and small-group friend activity
            </p>
          </div>
        </div>
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
    </div>
  );
}
