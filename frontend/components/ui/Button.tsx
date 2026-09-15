"use client";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-soft",
  secondary: "bg-bg-card text-ink hover:bg-line border border-line",
  ghost: "text-ink-soft hover:text-ink hover:bg-bg-card",
  danger: "bg-red-600/90 text-white hover:bg-red-600",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:opacity-40 disabled:cursor-not-allowed",
        variants[variant], sizes[size], className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";