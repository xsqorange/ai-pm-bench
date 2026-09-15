"use client";
import { cn } from "@/lib/utils";

export function Badge({ children, className, color = "default" }: { children: React.ReactNode; className?: string; color?: "default" | "ok" | "warn" | "error" | "info" }) {
  const colors = {
    default: "bg-line text-ink-soft",
    ok: "bg-emerald-500/15 text-emerald-300",
    warn: "bg-amber-500/15 text-amber-300",
    error: "bg-red-500/15 text-red-300",
    info: "bg-brand/15 text-brand-soft",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", colors[color], className)}>
      {children}
    </span>
  );
}