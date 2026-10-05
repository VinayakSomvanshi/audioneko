import { Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BottomNav } from "../components/layout/BottomNav";
import { Header } from "../components/layout/Header";
import { Sidebar } from "../components/layout/Sidebar";
import { MiniPlayer } from "../components/player/MiniPlayer";
import { SearchPaletteModal } from "../components/search/SearchPaletteModal";

export function RootLayout() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Safeguard: If landing with invite ?token= on any route outside /join, redirect to /join
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token && window.location.pathname !== "/join") {
      window.location.href = `/join?token=${encodeURIComponent(token)}`;
    }
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
