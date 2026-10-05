import { Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BottomNav } from "../components/layout/BottomNav";
import { Header } from "../components/layout/Header";
import { Sidebar } from "../components/layout/Sidebar";
import { MiniPlayer } from "../components/player/MiniPlayer";
import { SearchPaletteModal } from "../components/search/SearchPaletteModal";
import { updateSearchIndex } from "../lib/search";

// Initial library catalogue for instant offline & client-side indexing
const INITIAL_SEARCHABLE_BOOKS = [
  {
    id: "sample_m4b_1",
    title: "Project Hail Mary",
    author: "Andy Weir",
    narrator: "Ray Porter",
    durationSeconds: 57900,
    publishedYear: 2021,
    description:
      "Ryland Grace is the sole survivor on a desperate, last-chance mission—and if he fails, humanity and the earth itself will perish.",
  },
  {
    id: "sample_m4b_2",
    title: "The Way of Kings",
    author: "Brandon Sanderson",
    narrator: "Michael Kramer & Kate Reading",
    series: "The Stormlight Archive",
    seriesIndex: 1,
    durationSeconds: 164160,
    publishedYear: 2010,
    description:
      "Roshar is a world of stone and storms. Uncanny tempests of incredible power sweep across the rocky terrain.",
  },
  {
    id: "sample_m4b_3",
    title: "Dune",
    author: "Frank Herbert",
    narrator: "George Guidall",
    series: "Dune Chronicles",
    seriesIndex: 1,
    durationSeconds: 75600,
    publishedYear: 1965,
    description: "A sweeping science fiction masterpiece set on the desert planet Arrakis.",
  },
];

export function RootLayout() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Initialize search index on mount
  useEffect(() => {
    updateSearchIndex(INITIAL_SEARCHABLE_BOOKS);
  }, []);

  // Global shortcut listener: Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col antialiased selection:bg-accent-bg selection:text-accent">
      <Header onSearchClick={() => setIsSearchOpen(true)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar onSearchClick={() => setIsSearchOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <MiniPlayer />
      <BottomNav onSearchClick={() => setIsSearchOpen(true)} />

      {/* Instant Client-Side Search Palette */}
      <SearchPaletteModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
