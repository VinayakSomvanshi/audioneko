import { Link, useLocation } from "@tanstack/react-router";
import { BookOpen, HardDriveDownload, Library, Menu, Users } from "lucide-react";
import { useDownloads } from "../../lib/download-manager";
import { BlinkingNeko } from "../icons/NekoIcon";

interface BottomNavProps {
  onSearchClick?: () => void;
  onMenuClick?: () => void;
}

export function BottomNav({ onMenuClick }: BottomNavProps) {
  const location = useLocation();
  const { activeCount } = useDownloads();

  const navItems = [
    { label: "Library", href: "/", icon: Library },
    { label: "Series", href: "/series", icon: BookOpen },
    { label: "Authors", href: "/authors", icon: Users },
    { label: "Offline", href: "/offline", icon: HardDriveDownload },
  ];

  const isMoreActive = ["/shelves", "/notebook", "/analytics", "/admin"].some((path) =>
    location.pathname.startsWith(path),
  );

  return (
    <nav className="md:hidden shrink-0 z-30 min-h-14 h-auto bg-bg border-t border-border flex items-center justify-around px-2 py-1 pb-[calc(0.35rem+env(safe-area-inset-bottom,0px))] select-none">
      {navItems.map((item) => {
        const isActive = location.pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            to={item.href}
            className={`relative flex flex-col items-center justify-center gap-1 min-w-12 py-1 text-[10px] font-mono transition-colors ${
              isActive ? "text-accent font-semibold" : "text-muted hover:text-text"
            }`}
          >
            <div className="relative">
              <Icon className="w-4 h-4" />
              {item.href === "/offline" && activeCount > 0 && (
                <span className="absolute -top-1.5 -right-2 flex items-center justify-center">
                  <BlinkingNeko className="w-2.5 h-2.5 text-accent" />
                </span>
              )}
            </div>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onMenuClick}
        className={`flex flex-col items-center justify-center gap-1 min-w-12 py-1 text-[10px] font-mono cursor-pointer transition-colors ${
          isMoreActive ? "text-accent font-semibold" : "text-muted hover:text-text"
        }`}
      >
        <Menu className="w-4 h-4" />
        <span className="truncate">More</span>
      </button>
    </nav>
  );
}
