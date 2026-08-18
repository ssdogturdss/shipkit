import { Link, useLocation } from "wouter";
import { LayoutDashboard, List, Settings as SettingsIcon, Rocket } from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/runs", label: "Run History", icon: List },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border h-full flex flex-col">
      <div className="p-6 flex items-center gap-3 border-b border-border">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
          <Rocket size={18} />
        </div>
        <span className="font-mono font-bold text-lg tracking-wider text-primary">SHIPKIT</span>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {links.map((link) => {
          const isActive = location === link.href || (link.href !== "/" && location.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                isActive 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <link.icon size={18} />
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border text-xs text-muted-foreground font-mono">
        v1.0.0-beta
      </div>
    </aside>
  );
}
