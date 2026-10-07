import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BottomNav } from "../components/layout/BottomNav";
import { Header } from "../components/layout/Header";
import { MobileNavDrawer } from "../components/layout/MobileNavDrawer";
import { MobileQuickNav } from "../components/layout/MobileQuickNav";
import { Sidebar } from "../components/layout/Sidebar";
import { MiniPlayer } from "../components/player/MiniPlayer";
import { ProfilePreferencesModal } from "../components/profile/ProfilePreferencesModal";
import { SearchPaletteModal } from "../components/search/SearchPaletteModal";
import { useCurrentUser } from "../lib/auth-client";

export function RootLayout() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading } = useCurrentUser();

  useEffect(() => {
    const isDarkTheme = document.documentElement.classList.contains("dark");
    setIsDark(isDarkTheme);
  }, []);

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("audioneko-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("audioneko-theme", "light");
    }
  };

  // Safeguard: If landing with invite ?token= on root or library, redirect to /join.
  // Never redirect when on /login or when query indicates a password reset.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const isReset = params.has("resetToken") || params.has("email");
    const currentPath = window.location.pathname;

    if (token && !isReset && currentPath !== "/join" && currentPath !== "/login") {
      window.location.href = `/join?token=${encodeURIComponent(token)}`;
    }
  }, []);

  // Authentication & RBAC Guard:
  // If not logged in and not on public auth route (/login, /join, /offline), redirect to /login
  useEffect(() => {
    if (!isLoading && !user) {
      const path = location.pathname;
      if (path !== "/login" && path !== "/join" && path !== "/offline") {
        navigate({ to: "/login" });
      }
    }
  }, [isLoading, user, location.pathname, navigate]);

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

  // For unauthenticated users on /login or /join: render clean auth view without library navigation & miniplayer
  const isAuthPage = location.pathname === "/login" || location.pathname === "/join";
  if (!isLoading && !user && isAuthPage) {
    return (
      <div className="h-screen h-dvh bg-bg text-text flex flex-col antialiased selection:bg-accent-bg selection:text-accent overflow-hidden">
        <Header onSearchClick={() => setIsSearchOpen(true)} />
        <main className="flex-1 overflow-y-auto min-h-0 p-4 md:p-8 flex items-center justify-center">
          <div className="w-full max-w-md mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  // If loading auth state initially, show subtle dark container without flashing broken UI
  if (isLoading) {
    return (
      <div className="h-screen h-dvh bg-bg text-text flex flex-col antialiased selection:bg-accent-bg selection:text-accent overflow-hidden">
        <Header onSearchClick={() => setIsSearchOpen(true)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono text-muted">Loading audioneko...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen h-dvh bg-bg text-text flex flex-col antialiased selection:bg-accent-bg selection:text-accent overflow-hidden">
      <Header
        onSearchClick={() => setIsSearchOpen(true)}
        onMenuClick={() => setIsDrawerOpen(true)}
        onProfileClick={() => setIsProfileOpen(true)}
      />

      {/* Mobile Horizontal Quick Navigation Bar */}
      <MobileQuickNav />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar />

        <main className="flex-1 overflow-y-auto min-h-0 p-3.5 sm:p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <MiniPlayer />
      <BottomNav
        onSearchClick={() => setIsSearchOpen(true)}
        onMenuClick={() => setIsDrawerOpen(true)}
      />

      {/* Mobile Slide-Out Navigation Drawer with full collection options */}
      <MobileNavDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSearchClick={() => setIsSearchOpen(true)}
        onProfileClick={() => setIsProfileOpen(true)}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />

      {/* Profile & Playback Preferences Dialog */}
      <ProfilePreferencesModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />

      {/* Instant Client-Side Search Palette */}
      <SearchPaletteModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
