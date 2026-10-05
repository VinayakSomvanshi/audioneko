import { Link, useLocation } from "@tanstack/react-router";
import {
  Flame,
  HardDriveDownload,
  Library,
  Search,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { useCurrentUser } from "../../lib/auth-client";

interface BottomNavProps {
  onSearchClick?: () => void;
}

export function BottomNav({ onSearchClick }: BottomNavProps) {
  const location = useLocation();
  const { isAdmin } = useCurrentUser();

  const navItems = [
    { label: "Library", href: "/", icon: Library },
    { label: "Activity", href: "/analytics", icon: Flame },
    { label: "Offline", href: "/offline", icon: HardDriveDownload },
  ];

  if (isAdmin) {
    navItems.push({ label: "Admin", href: "/admin", icon: ShieldCheck });
  } else {
    navItems.push({ label: "Account", href: "/login", icon: UserIcon });
  }

  return (
    <nav className="md:hidden shrink-0 z-30 h-14 bg-bg border-t border-border flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
      {navItems.map((item) => {
        const isActive = location.pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            to={item.href}
            className={`flex flex-col items-center justify-center gap-1 w-14 py-1 text-[10px] font-mono transition-colors ${
              isActive ? "text-accent" : "text-muted hover:text-text"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onSearchClick}
        className="flex flex-col items-center justify-center gap-1 w-14 py-1 text-[10px] font-mono text-muted hover:text-accent cursor-pointer transition-colors"
      >
        <Search className="w-4 h-4" />
        <span>Search</span>
      </button>
    </nav>
  );
}
