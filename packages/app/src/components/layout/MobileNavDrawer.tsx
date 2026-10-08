import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  Bookmark,
  Flame,
  HardDriveDownload,
  Library,
  Moon,
  Palette,
  Search,
  ShieldCheck,
  Sliders,
  Sun,
  User,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { performSignOut, useCurrentUser } from "../../lib/auth-client";
import { useDownloads } from "../../lib/download-manager";
import { THEME_PALETTES, useTheme } from "../../lib/theme";
import { BlinkingNeko, NekoIcon } from "../icons/NekoIcon";

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSearchClick?: () => void;
  onProfileClick?: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
}

export function MobileNavDrawer({
  isOpen,
  onClose,
  onSearchClick,
  onProfileClick,
  isDark: _isDark,
  onToggleTheme: _onToggleTheme,
}: MobileNavDrawerProps) {
  const location = useLocation();
  const { user, isAdmin } = useCurrentUser();
  const { activeCount } = useDownloads();
  const { palette: currentPalette, setPalette, mode: currentMode, setMode } = useTheme();
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Close drawer on escape key and prevent background scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const navItems = [
    { label: "Library", href: "/", icon: Library },
    { label: "Analytics & Streaks", href: "/analytics", icon: Flame },
    { label: "Series", href: "/series", icon: BookOpen },
    { label: "Authors", href: "/authors", icon: Users },
    { label: "Shelves", href: "/shelves", icon: Bookmark },
    { label: "Notebook & Quotes", href: "/notebook", icon: BookOpen },
    { label: "Offline OPFS", href: "/offline", icon: HardDriveDownload },
  ];

  if (isAdmin) {
    navItems.push({ label: "Admin Console", href: "/admin", icon: ShieldCheck });
  }

  if (!isOpen) return null;

  return (
    <dialog
      open
      className="fixed inset-0 z-50 md:hidden flex bg-transparent border-0 p-0 m-0 w-full h-full max-w-none max-h-none backdrop:bg-transparent"
      aria-label="Mobile Navigation"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClose();
        }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Drawer content */}
      <div className="relative w-[85%] max-w-[320px] bg-bg border-r border-border h-full flex flex-col shadow-2xl z-10 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] animate-in slide-in-from-left duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Link
            to="/"
            onClick={onClose}
            className="flex items-center gap-2 font-mono text-base font-medium text-text hover:text-accent transition-colors"
          >
            <NekoIcon className="w-5 h-5 text-accent shrink-0" />
            <span>audioneko</span>
            <span className="text-[10px] uppercase tracking-widest text-muted border border-border px-1.5 py-0.5 rounded font-mono">
              pwa
            </span>
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-accent transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Search Action */}
        <div className="p-3 border-b border-border/60">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSearchClick?.();
            }}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-muted surface-card hover:border-accent hover:text-text transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-accent" />
              <span>Search audiobooks...</span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] border border-border rounded bg-elevated text-subtle">
              /
            </kbd>
          </button>
        </div>

        {/* Collection Nav List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-subtle px-3 py-1.5">
            Collection & Library
          </div>

          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-mono transition-colors ${
                  isActive
                    ? "bg-accent-bg text-accent font-semibold border border-accent/30"
                    : "text-muted hover:text-text hover:bg-surface border border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-accent" : "text-subtle"}`} />
                <span className="flex-1 truncate">{item.label}</span>

                {item.href === "/offline" && activeCount > 0 && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-accent/20 text-accent border border-accent/40 font-semibold">
                    <BlinkingNeko className="w-2.5 h-2.5 text-accent" />
                    <span>{activeCount}</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Drawer Footer: User & Settings */}
        <div className="p-3 border-t border-border bg-surface/50 space-y-2">
          {user && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onProfileClick?.();
              }}
              className="w-full text-left px-3 py-2 rounded-lg border border-border bg-surface hover:border-accent hover:text-accent transition-colors flex items-center justify-between text-xs font-mono group cursor-pointer"
              title="Open Profile and Preferences"
            >
              <div className="flex items-center gap-2 truncate">
                <User className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="text-text font-medium group-hover:text-accent truncate">
                  {user.name || user.email}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isAdmin && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 uppercase font-semibold">
                    Admin
                  </span>
                )}
                <Sliders className="w-3 h-3 text-muted group-hover:text-accent" />
              </div>
            </button>
          )}

          {/* Theme Palette Chips */}
          <div className="p-2.5 rounded-lg border border-border bg-surface/60 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono text-muted uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Palette className="w-3 h-3 text-accent" />
                <span>Theme Palette</span>
              </span>
              <span className="text-accent font-medium">
                {THEME_PALETTES.find((p) => p.id === currentPalette)?.name}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {THEME_PALETTES.map((p) => {
                const isSelected = currentPalette === p.id;
                const swatch = currentMode === "dark" ? p.swatchDark : p.swatchLight;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPalette(p.id)}
                    title={`${p.name} - ${p.subtitle}`}
                    className={`h-7 rounded flex items-center justify-center border transition-all cursor-pointer ${
                      isSelected
                        ? "border-accent ring-1 ring-accent bg-accent-bg"
                        : "border-border hover:border-accent/40 bg-surface"
                    }`}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full shadow-xs"
                      style={{ backgroundColor: swatch }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode(currentMode === "dark" ? "light" : "dark")}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-xs font-mono text-muted hover:text-accent hover:border-accent transition-colors cursor-pointer"
            >
              {currentMode === "dark" ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
              <span>{currentMode === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </button>

            {user ? (
              <button
                type="button"
                disabled={isSigningOut}
                onClick={async () => {
                  setIsSigningOut(true);
                  onClose();
                  await performSignOut();
                }}
                className="px-3 py-2 rounded-lg border border-border bg-surface text-xs font-mono text-muted hover:text-accent hover:border-accent transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            ) : (
              <Link
                to="/login"
                onClick={onClose}
                className="flex-1 text-center px-3 py-2 rounded-lg border border-accent/40 bg-accent-bg text-xs font-mono text-accent hover:border-accent transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
