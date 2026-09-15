"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare, Bot, FolderGit2, ListChecks, ShieldAlert,
  Gauge, FileText, LayoutDashboard,
} from "lucide-react";
import { clsx } from "clsx";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, ready: true },
  { href: "/agents", label: "Agents", icon: Bot, ready: true },
  { href: "/chat", label: "Chat", icon: MessageSquare, ready: true },
  { href: "/projects", label: "Projects", icon: FolderGit2, ready: true },
  { href: "/requirements", label: "Requirements", icon: ListChecks, ready: true },
  { href: "/reviews", label: "Reviews", icon: ShieldAlert, ready: true },
  { href: "/performance", label: "Performance", icon: Gauge, ready: true },
  { href: "/documents", label: "Documents", icon: FileText, ready: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-line bg-bg-soft flex flex-col">
      <div className="px-5 py-5 border-b border-line">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-bold">W</div>
          <div>
            <div className="font-semibold leading-tight">AI Workbench</div>
            <div className="text-xs text-ink-dim">本地开发平台</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {items.map((it) => {
          const Icon = it.icon;
          const active = pathname === it.href || (it.href !== "/" && pathname?.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.ready ? it.href : "#"}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition",
                active ? "bg-brand/15 text-brand-soft" : "text-ink-soft hover:bg-bg-card",
                !it.ready && "opacity-40 cursor-not-allowed pointer-events-none",
              )}
            >
              <Icon size={16} />
              <span>{it.label}</span>
              {!it.ready && <span className="ml-auto text-[10px] text-ink-dim">W3+</span>}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-line text-xs text-ink-dim">
        <div>Backend: <span className="text-ink">127.0.0.1:8000</span></div>
        <div>API: <a className="text-brand-soft hover:underline" href="http://127.0.0.1:8000/docs" target="_blank">/docs</a></div>
      </div>
    </aside>
  );
}