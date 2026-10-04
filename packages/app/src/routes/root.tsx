import { Outlet } from "@tanstack/react-router";
import { BottomNav } from "../components/layout/BottomNav";
import { Header } from "../components/layout/Header";
import { Sidebar } from "../components/layout/Sidebar";
import { MiniPlayer } from "../components/player/MiniPlayer";

export function RootLayout() {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col antialiased selection:bg-accent-bg selection:text-accent">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <MiniPlayer />
      <BottomNav />
    </div>
  );
}
