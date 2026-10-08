import { Link, useLocation } from "@tanstack/react-router";
import { BookOpen, Bookmark, Flame, HardDriveDownload, Library, Users } from "lucide-react";
import { useDownloads } from "../../lib/download-manager";
import { BlinkingNeko } from "../icons/NekoIcon";

export function MobileQuickNav() {
  const location = useLocation();
  const { activeCount } = useDownloads();

  const tabs = [
    { label: "Library", href: "/", icon: Library },
    { label: "Series", href: "/series", icon: BookOpen },
    { label: "Authors", href: "/authors", icon: Users },
    { label: "Shelves", href: "/shelves", icon: Bookmark },
    { label: "Notebook", href: "/notebook", icon: BookOpen },
    { label: "Analytics", href: "/analytics", icon: Flame },
    { label: "Offline", href: "/offline", icon: HardDriveDownload },
  ];

  return (
    <div className="md:hidden shrink-0 z-30 bg-bg/95 backdrop-blur-md border-b border-border/80 px-2.5 py-1.5 overflow-x-auto no-scrollbar flex items-center gap-1.5 select-none">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.href;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            to={tab.href}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono whitespace-nowrap shrink-0 transition-all ${
              isActive
                ? "bg-accent text-bg font-semibold shadow-xs"
                : "bg-surface border border-border text-muted hover:text-text hover:border-text-subtle"
            }`}
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span>{tab.label}</span>
            {tab.href === "/offline" && activeCount > 0 && (
              <span className="flex items-center gap-0.5 ml-0.5">
                <BlinkingNeko className="w-2.5 h-2.5" />
                <span className="text-[10px] font-bold">{activeCount}</span>
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
