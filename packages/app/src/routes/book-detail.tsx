import type { Book, Chapter } from "@audioneko/shared";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Download, ListMusic, Play } from "lucide-react";
import { useAudio } from "../context/audio-context";

const MOCK_CHAPTERS: Chapter[] = [
  {
    id: "ch_1",
    bookId: "sample_m4b_1",
    chapterIndex: 1,
    title: "Chapter 1: The Slumber",
    startTime: 0,
    endTime: 1820,
    duration: 1820,
  },
  {
    id: "ch_2",
    bookId: "sample_m4b_1",
    chapterIndex: 2,
    title: "Chapter 2: Two Dead Crewmates",
    startTime: 1820,
    endTime: 3740,
    duration: 1920,
  },
  {
    id: "ch_3",
    bookId: "sample_m4b_1",
    chapterIndex: 3,
    title: "Chapter 3: Meet Petrova",
    startTime: 3740,
    endTime: 5890,
    duration: 2150,
  },
  {
    id: "ch_4",
    bookId: "sample_m4b_1",
    chapterIndex: 4,
    title: "Chapter 4: The Astrophage Discovery",
    startTime: 5890,
    endTime: 8120,
    duration: 2230,
  },
  {
    id: "ch_5",
    bookId: "sample_m4b_1",
    chapterIndex: 5,
    title: "Chapter 5: Taumoeba Cultivation",
    startTime: 8120,
    endTime: 10450,
    duration: 2330,
  },
];

export function BookDetailPage() {
  const { id } = useParams({ strict: false });
  const { playBook, currentBook, isPlaying, seekTo } = useAudio();

  const mockBook: Book = {
    id: id || "sample_m4b_1",
    driveFolderId: "fld_1",
    title: "Project Hail Mary",
    author: "Andy Weir",
    narrator: "Ray Porter",
    durationSeconds: 57900,
    format: "m4b",
    fileSizeBytes: 420 * 1024 * 1024,
    isActiveShelf: true,
    publishedYear: 2021,
    description:
      "Ryland Grace is the sole survivor on a desperate, last-chance mission—and if he fails, humanity and the earth itself will perish. Except that right now, he doesn't know that. He can't even remember his own name, let alone the nature of his assignment or how to complete it.",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const formatSeconds = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${h > 0 ? `${h}:` : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
      {/* Back button */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Library</span>
        </Link>
      </div>

      {/* Main Book Card */}
      <div className="surface-card p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start border border-border">
        {/* Cover presentation */}
        <div className="w-48 h-48 md:w-56 md:h-56 rounded border border-border bg-elevated shrink-0 flex items-center justify-center font-mono text-muted text-xl font-bold shadow-sm">
          {mockBook.format.toUpperCase()}
        </div>

        {/* Metadata & Actions */}
        <div className="flex-1 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-accent">
              <span>{mockBook.format.toUpperCase()} SINGLE FILE</span>
              <span>•</span>
              <span>{mockBook.publishedYear}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text">
              {mockBook.title}
            </h1>
            <p className="text-sm font-mono text-muted">
              By <span className="text-text">{mockBook.author}</span>
            </p>
            {mockBook.narrator && (
              <p className="text-xs font-mono text-subtle">Narrated by {mockBook.narrator}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => playBook(mockBook)}
              className="px-6 py-2.5 rounded bg-accent text-bg text-xs font-mono font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {isPlaying && currentBook?.id === mockBook.id ? "PAUSE" : "START LISTENING"}
              </span>
            </button>

            <button
              type="button"
              className="px-4 py-2.5 rounded surface-card text-muted hover:text-text hover:border-text-subtle text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>SAVE TO OPFS</span>
            </button>
          </div>

          <p className="text-xs text-muted leading-relaxed pt-2">{mockBook.description}</p>
        </div>
      </div>

      {/* Chapters Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2 text-xs font-mono text-text font-semibold">
            <ListMusic className="w-4 h-4 text-accent" />
            <span>CHAPTERS ({MOCK_CHAPTERS.length})</span>
          </div>
          <span className="text-[11px] font-mono text-subtle">Extracted from ISO-BMFF Atoms</span>
        </div>

        <div className="divide-y divide-border surface-card border border-border">
          {MOCK_CHAPTERS.map((ch, idx) => (
            <button
              type="button"
              key={ch.id}
              className="w-full text-left p-3.5 flex items-center justify-between hover:bg-elevated/40 transition-colors group cursor-pointer"
              onClick={() => {
                if (currentBook?.id !== mockBook.id) {
                  playBook(mockBook, ch.startTime);
                } else {
                  seekTo(ch.startTime);
                }
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-subtle w-6">
                  {(idx + 1).toString().padStart(2, "0")}
                </span>
                <span className="text-xs font-medium text-text group-hover:text-accent transition-colors">
                  {ch.title}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-muted">
                  {formatSeconds(ch.startTime)}
                </span>
                <Play className="w-3.5 h-3.5 text-subtle group-hover:text-accent fill-current opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
