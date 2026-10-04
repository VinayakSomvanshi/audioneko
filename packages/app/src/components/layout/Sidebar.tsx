import { Link, useLocation } from "@tanstack/react-router";
import { BookOpen, Bookmark, HardDriveDownload, KeyRound, Library, Users } from "lucide-react";
import { useSession } from "../../lib/auth-client";

export function Sidebar() {
  const location = useLocation();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const navItems = [
    { label: "Library", href: "/", icon: Library },
    { label: "Series", href: "/series", icon: BookOpen },
    { label: "Authors", href: "/authors", icon: Users },
    { label: "Shelves", href: "/shelves", icon: Bookmark },
    { label: "Offline OPFS", href: "/offline", icon: HardDriveDownload },
  ];

  if (isAdmin) {
    navItems.push({ label: "Invites (Admin)", href: "/admin/invites", icon: KeyRound });
  }

  return (
    <aside className="w-56 hidden md:flex flex-col border-r border-border bg-bg p-3 shrink-0 select-none">
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
