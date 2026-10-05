import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  Bookmark,
  Flame,
  HardDriveDownload,
  KeyRound,
  Library,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useCurrentUser } from "../../lib/auth-client";

interface SidebarProps {
  onSearchClick?: () => void;
}

export function Sidebar({ onSearchClick }: SidebarProps) {
  const location = useLocation();
  const { isAdmin } = useCurrentUser();

  const navItems = [
    { label: "Library", href: "/", icon: Library },
    { label: "Analytics & Streaks", href: "/analytics", icon: Flame },
    { label: "Series", href: "/series", icon: BookOpen },
    { label: "Authors", href: "/authors", icon: Users },
    { label: "Shelves", href: "/shelves", icon: Bookmark },
    { label: "Offline OPFS", href: "/offline", icon: HardDriveDownload },
  ];

  if (isAdmin) {
    navItems.push({ label: "Admin Console", href: "/admin", icon: ShieldCheck });
  }

  return (
    <aside className="w-56 hidden md:flex flex-col border-r border-border bg-bg p-3 shrink-0 select-none h-full overflow-y-auto">
      <div className="mb-2">
        <button
          type="button"
          onClick={onSearchClick}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded text-xs font-mono text-muted surface-card hover:border-accent hover:text-text transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-accent" />
            <span>Search</span>
          </span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono border border-border rounded bg-elevated text-subtle">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="text-[11px] font-mono uppercase tracking-wider text-subtle px-3 py-2">
        Collection
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-xs font-mono transition-colors ${
                isActive
                  ? "bg-accent-bg text-accent font-medium border border-accent/20"
                  : "text-muted hover:text-text hover:bg-surface"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-accent" : "text-subtle"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Cloudflare Edge Quota Card */}
      <div className="mt-auto surface-card p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-subtle">
          <span>ACTIVE SHELF (R2)</span>
          <span className="text-accent font-medium">0 / 10 GB</span>
        </div>
        <div className="w-full bg-elevated h-1 rounded overflow-hidden">
          <div className="bg-accent h-full w-[0%]" />
        </div>
        <div className="text-[10px] font-mono text-muted flex items-center justify-between">
          <span>Tier 1 Drive Cold</span>
          <span className="text-[9px] text-accent">READY</span>
        </div>
      </div>
    </aside>
  );
}
