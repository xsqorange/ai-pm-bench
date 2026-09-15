"use client";
import { cn } from "@/lib/utils";
import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:border-brand",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:border-brand",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";