import { Link } from "@tanstack/react-router";
import { Moon, Search, ShieldCheck, Sun, User as UserIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { signOut, useCurrentUser } from "../../lib/auth-client";

interface HeaderProps {
  onSearchClick?: () => void;
}

export function Header({ onSearchClick }: HeaderProps) {
  const { user, isAdmin } = useCurrentUser();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const isDarkTheme = document.documentElement.classList.contains("dark");
    setIsDark(isDarkTheme);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle theme with 't' when not focused in an input
      if (e.key === "t" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        toggleTheme();
      }
      // Trigger search with '/'
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        onSearchClick?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSearchClick]);

  const toggleTheme = () => {
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

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-bg/95 backdrop-blur-sm px-4 md:px-6 flex items-center justify-between transition-colors">
      {/* Brand logo */}
      <Link
        to="/"
        className="flex items-center gap-2 font-mono text-sm md:text-base font-medium tracking-tight text-text hover:text-accent transition-colors"
      >
        <span className="logo-dot" />
        <span>audioneko</span>
        <span className="text-[10px] uppercase tracking-widest text-muted border border-border px-1.5 py-0.5 rounded font-mono hidden sm:inline-block">
          beta
        </span>
      </Link>

      {/* Center / Search bar trigger */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          type="button"
          onClick={onSearchClick}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-muted surface-card hover:border-text-subtle transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-subtle" />
            <span>Search books, authors, series...</span>
          </span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono border border-border rounded bg-elevated text-subtle">
            /
          </kbd>
        </button>
      </div>

      {/* Right controls: Theme toggle & Auth status */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSearchClick}
          className="p-2 md:hidden surface-card text-muted hover:text-text cursor-pointer"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 surface-card text-muted hover:text-accent hover:border-accent transition-all cursor-pointer"
          aria-label="Toggle theme"
          title="Toggle light/dark theme (T)"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {user ? (
          <div className="flex items-center gap-2 pl-1">
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded bg-accent-bg text-accent border border-accent/40 hover:border-accent transition-colors font-medium"
                title="Curator Admin Control Plane"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin</span>
              </Link>
            )}
            <span className="text-xs font-mono text-muted hidden lg:inline">{user.name}</span>
            <button
              type="button"
              onClick={() => signOut()}
              className="text-xs font-mono px-2.5 py-1 surface-card hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 surface-card hover:border-accent hover:text-accent transition-colors"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Sign in</span>
          </Link>
        )}
      </div>
    </header>
  );
}
