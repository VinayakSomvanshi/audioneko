import { Link, useLocation } from "@tanstack/react-router";
import { Flame, HardDriveDownload, Library, User as UserIcon } from "lucide-react";

export function BottomNav() {
  const location = useLocation();

  const navItems = [
    { label: "Library", href: "/", icon: Library },
    { label: "Activity", href: "/analytics", icon: Flame },
    { label: "Offline", href: "/offline", icon: HardDriveDownload },
    { label: "Account", href: "/login", icon: UserIcon },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-bg border-t border-border flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
      {navItems.map((item) => {
        const isActive = location.pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            to={item.href}
            className={`flex flex-col items-center justify-center gap-1 w-16 py-1 text-[10px] font-mono transition-colors ${
              isActive ? "text-accent" : "text-muted hover:text-text"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
