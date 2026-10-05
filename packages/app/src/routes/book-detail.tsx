import type { Book, Chapter } from "@audioneko/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ListMusic, Play } from "lucide-react";
import { DownloadButton } from "../components/storage/DownloadButton";
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

  const { data: bookData } = useQuery({
    queryKey: ["book", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/books/${id}`);
      if (!res.ok) return null;
      return (await res.json()) as { book: Book; chapters: Chapter[] };
    },
    enabled: !!id,
  });

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
      "Ryland Grace is the sole survivor on a desperate, last-chance mission—and if he fails, humanity and the earth itself will perish.",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const book = bookData?.book || mockBook;
  const chapters =
    bookData?.chapters && bookData.chapters.length > 0 ? bookData.chapters : MOCK_CHAPTERS;

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
        <div className="w-48 h-48 md:w-56 md:h-56 rounded border border-border bg-elevated shrink-0 flex items-center justify-center font-mono text-muted text-xl font-bold shadow-sm overflow-hidden">
          {book.coverR2Key ? (
            <img
              src={`/api/covers/${book.id}`}
              alt={book.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            book.format.toUpperCase()
          )}
        </div>

        {/* Metadata Details */}
        <div className="flex-1 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-accent">
              <span className="logo-dot" />
              <span>{book.format.toUpperCase()} AUDIOBOOK</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text">
              {book.title}
            </h1>
            <p className="text-sm font-mono text-muted">
              By <span className="text-text font-medium">{book.author}</span>
              {book.narrator && (
                <span>
                  {" "}
                  • Narrated by <span className="text-text">{book.narrator}</span>
                </span>
              )}
            </p>
          </div>

          <p className="text-xs text-muted leading-relaxed line-clamp-4">
            {book.description || `${book.title} by ${book.author}.`}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-subtle pt-2">
            <div>
              <span className="text-muted">Length: </span>
              <span>{formatSeconds(book.durationSeconds)}</span>
            </div>
            <div>
              <span className="text-muted">Size: </span>
              <span>{(book.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
            </div>
            {book.isActiveShelf && (
              <span className="text-accent border border-accent/30 px-2 py-0.5 rounded text-[10px]">
                Active Shelf Cached
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={() => playBook(book, 0, chapters)}
              className="px-6 py-2.5 rounded bg-accent text-bg font-mono font-medium text-xs flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {isPlaying && currentBook?.id === book.id ? "PAUSE PLAYBACK" : "LISTEN NOW"}
              </span>
            </button>

            {/* Offline OPFS Download Button */}
            <DownloadButton book={book} />
          </div>
        </div>
      </div>

      {/* Chapters Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2 font-mono text-xs text-text font-medium">
            <ListMusic className="w-4 h-4 text-accent" />
            <span>CHAPTERS ({chapters.length})</span>
          </div>
          <span className="text-[11px] font-mono text-subtle">
            Total: {formatSeconds(book.durationSeconds)}
          </span>
        </div>

        <div className="surface-card divide-y divide-border border border-border">
          {chapters.map((chapter) => {
            const isCurrentPlaying = isPlaying && currentBook?.id === book.id;

            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => {
                  if (currentBook?.id !== book.id) {
                    playBook(book, chapter.startTime, chapters);
                  } else {
                    seekTo(chapter.startTime);
                  }
                }}
                className={`w-full p-3.5 flex items-center justify-between text-left hover:bg-elevated transition-colors cursor-pointer ${
                  isCurrentPlaying ? "bg-accent-bg" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-subtle w-6">
                    {chapter.chapterIndex.toString().padStart(2, "0")}
                  </span>
                  <span className="text-xs font-medium text-text">{chapter.title}</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono text-subtle">
                  <span>{formatSeconds(chapter.startTime)}</span>
                  <span className="text-[10px] text-muted">
                    ({formatSeconds(chapter.duration)})
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
