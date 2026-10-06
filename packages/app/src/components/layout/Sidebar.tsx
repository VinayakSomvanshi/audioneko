import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  Bookmark,
  Flame,
  HardDriveDownload,
  Library,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useCurrentUser } from "../../lib/auth-client";

export function Sidebar() {
  const location = useLocation();
  const { isAdmin } = useCurrentUser();

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

  return (
    <aside className="w-56 hidden md:flex flex-col border-r border-border bg-bg p-3 shrink-0 select-none h-full overflow-y-auto">
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
    </aside>
  );
}
